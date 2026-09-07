import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyProxyStatus, ConnectionDoctor } from './connection-doctor';
import { CorsProxySettings } from '../../../../providers/cors-proxy/cors-proxy-settings';
import {
  corsHint,
  CorsReadable,
  homeServerTarget,
  interpret,
  outcomeLabel,
  probeTargets,
  ProbeResult,
  ProbeTarget,
  ProbeVerdict,
  proxyHint,
  ProxyVerdict,
  rowOutcome,
  timingHint,
} from './connection-doctor-catalog';
import { enableProxyFlags } from '../../../../testing/enable-proxy-flags';
import { translateEn } from '../../../../testing/translate-en';

const translate = translateEn;

const PROBE_TARGETS = probeTargets(translate);

/** A ProbeResult with the fields a given assertion does not care about filled in. */
function result(
  verdict: ProbeVerdict,
  cors: CorsReadable,
  ms: number | null,
  proxy: ProxyVerdict = 'unknown',
  proxyMs: number | null = null,
): ProbeResult {
  return { verdict, cors, proxy, ms, proxyMs };
}

function target(id: string, probeUrl = `https://${id}.example/`): ProbeTarget {
  return {
    id,
    host: `${id}.example`,
    label: id,
    category: 'connector',
    probeUrl,
    openUrl: `https://${id}.example`,
    matters: 'nothing',
    status: null,
  };
}

describe('ConnectionDoctor (probes)', () => {
  let doctor: ConnectionDoctor;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    doctor = TestBed.inject(ConnectionDoctor);
  });

  /**
   * Select a real catalog proxy, so the probe builds a real proxied URL.
   *
   * AllOrigins ships flagged off, so the flag is lifted first — these tests are
   * about the doctor's proxy leg, not about which vendor is offered. See
   * `enable-proxy-flags.ts`.
   */
  function configureProxy(): void {
    enableProxyFlags();
    TestBed.inject(CorsProxySettings).select('allorigins');
  }

  /** Every fetch this sweep made, as (url, init) pairs. */
  function calls(): { url: string; init: RequestInit }[] {
    return fetchMock.mock.calls.map(([url, init]) => ({
      url: url as string,
      init: (init ?? {}) as RequestInit,
    }));
  }

  function proxiedCall(): { url: string; init: RequestInit } | undefined {
    return calls().find((call) => call.url.includes('allorigins'));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a host that answers as reachable', async () => {
    await doctor.runAll([target('ok')]);
    expect(doctor.results()['ok'].verdict).toBe('reachable');
    expect(doctor.lastRunAt()).not.toBeNull();
  });

  it('sends no credentials and reads no response', async () => {
    await doctor.runAll([target('ok')]);

    // The whole page's promise is that it works before you have any keys and
    // touches none of the ones you do — so cookies must not ride along, and
    // no-cors is what makes an opaque success meaningful at all.
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe('omit');
    expect(init.mode).toBe('no-cors');
    // A cached success would report "reachable" on a network that is down.
    expect(init.cache).toBe('no-store');
  });

  it('asks separately whether the app may read the reply', async () => {
    await doctor.runAll([target('ok')]);

    // Two different questions with different remedies: "did bytes arrive" and
    // "may I look at them". Only the second is what a CORS proxy solves.
    expect(fetchMock.mock.calls[0][1].mode).toBe('no-cors');
    expect(fetchMock.mock.calls[1][1].mode).toBe('cors');
    expect(doctor.results()['ok'].cors).toBe('readable');
  });

  it('records a reachable host that refuses to be read as CORS-blocked', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      init.mode === 'cors'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    await doctor.runAll([target('opaque')]);

    const result = doctor.results()['opaque'];
    expect(result.verdict).toBe('reachable');
    expect(result.cors).toBe('blocked');
  });

  it('reports a host that refuses as blocked, without guessing why', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await doctor.runAll([target('blocked')]);
    expect(doctor.results()['blocked'].verdict).toBe('failed');
  });

  it('does not attempt a CORS verdict for a host it never reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await doctor.runAll([target('blocked')]);

    // The misdiagnosis this whole split exists to prevent: calling an
    // unreachable host "CORS blocked" is what sends people installing
    // extensions that cannot possibly help.
    expect(doctor.results()['blocked'].cors).toBe('unknown');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times how long the probe took', async () => {
    await doctor.runAll([target('ok')]);
    // The shape of a failure is evidence in its own right, so the duration has
    // to survive as a number rather than only as a verdict.
    expect(doctor.results()['ok'].ms).toBeTypeOf('number');
    expect(doctor.results()['ok'].ms).toBeGreaterThanOrEqual(0);
  });

  it('distinguishes our own timeout from an outright failure', async () => {
    // A drop and a refusal are different diagnoses, and this is the one
    // distinction a browser can honestly make: the abort came from our timer.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')));
        }),
    );
    const run = doctor.runAll([target('slow')], 5);
    await vi.waitFor(() => expect(doctor.results()['slow'].verdict).toBe('timeout'));
    await run;
  });

  it('probes every target rather than stopping at the first failure', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('a.example')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    await doctor.runAll([target('a'), target('b'), target('c')]);

    expect(doctor.results()['a'].verdict).toBe('failed');
    expect(doctor.results()['c'].verdict).toBe('reachable');
  });

  it('tries the configured proxy only for hosts that are reachable but unreadable', async () => {
    configureProxy();
    fetchMock.mockImplementation((url: string, init: RequestInit) =>
      init.mode === 'cors' && !url.includes('allorigins')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    await doctor.runAll([target('opaque')]);

    // The proxied URL carries the target, and the proxy's own key header.
    const proxied = proxiedCall();
    expect(proxied).toBeDefined();
    expect(proxied!.url).toContain(encodeURIComponent('https://opaque.example/'));
    expect(doctor.results()['opaque'].proxy).toBe('works');
  });

  it('does not send any credential of ours through the proxy', async () => {
    configureProxy();
    fetchMock.mockImplementation((url: string, init: RequestInit) =>
      init.mode === 'cors' && !url.includes('allorigins')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    await doctor.runAll([target('opaque')]);

    // The guard in cors-proxy.ts is bypassed deliberately here, so the thing it
    // protects has to be asserted directly: these probes are unauthenticated,
    // and nothing but the proxy's own key may ride along.
    const init = proxiedCall()!.init;
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string> | undefined)?.['Authorization']).toBeUndefined();
  });

  it('skips the proxy entirely for a host that is directly readable', async () => {
    configureProxy();
    await doctor.runAll([target('ok')]);

    // A proxy would add a hop and a middleman for nothing.
    expect(doctor.results()['ok'].proxy).toBe('not-needed');
    expect(proxiedCall()).toBeUndefined();
  });

  it('blames the target, not the proxy, when the proxy itself is alive', async () => {
    configureProxy();
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.includes('allorigins')) {
        // The proxied fetch fails, but the proxy's own origin answers.
        return init.mode === 'no-cors'
          ? Promise.resolve(new Response())
          : Promise.reject(new TypeError('Failed to fetch'));
      }
      return init.mode === 'cors'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response());
    });
    await doctor.runAll([target('opaque')]);

    // The distinction the connector's own error message cannot make: a healthy
    // proxy that this particular service turns away.
    expect(doctor.results()['opaque'].proxy).toBe('target-refused');
  });

  it('blames the proxy when the proxy host is unreachable too', async () => {
    configureProxy();
    fetchMock.mockImplementation((url: string, init: RequestInit) =>
      url.includes('allorigins') || init.mode === 'cors'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    await doctor.runAll([target('opaque')]);

    expect(doctor.results()['opaque'].proxy).toBe('proxy-unreachable');
  });

  it('reports that no proxy is configured rather than staying silent', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      init.mode === 'cors'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    await doctor.runAll([target('opaque')]);

    expect(doctor.results()['opaque'].proxy).toBe('none');
  });

  it('ignores a second sweep while one is in flight', async () => {
    // Every leg parks until released, so the sweep is genuinely still running
    // when the second call arrives rather than merely slow.
    const pending: (() => void)[] = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => pending.push(() => resolve(new Response()))),
    );

    const first = doctor.runAll([target('a')]);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    await doctor.runAll([target('a')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Release the reachability leg, then the CORS leg it starts in turn.
    pending.shift()!();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending.shift()!();

    await first;
    expect(doctor.running()).toBe(false);
  });
});

describe('homeServerTarget', () => {
  it('probes the instance endpoint of whatever server you are on', () => {
    const home = homeServerTarget('https://mastodon.social', translate);
    expect(home?.host).toBe('mastodon.social');
    expect(home?.probeUrl).toBe('https://mastodon.social/api/v1/instance');
    // Opening a raw API URL in a tab shows JSON, which teaches nobody
    // anything; the human-facing page is unmistakably either itself or a
    // block page.
    expect(home?.openUrl).toBe('https://mastodon.social/about');
  });

  it('contributes no row for the built-in mock', () => {
    // An empty base URL means same-origin, and probing your own origin from
    // your own origin proves nothing about the network.
    expect(homeServerTarget('', translate)).toBeNull();
  });
});

describe('status pages', () => {
  it('links the vendor’s own page where one exists', () => {
    const byId = new Map(PROBE_TARGETS.map((t) => [t.id, t]));
    expect(byId.get('github')!.status).toEqual({
      url: 'https://www.githubstatus.com/',
      label: 'GitHub Status',
      official: true,
    });
    expect(byId.get('openrouter')!.status?.official).toBe(true);
  });

  it('marks an aggregator as third-party rather than passing it off as official', () => {
    // T.LY publishes nothing itself, so the link is inference from outside and
    // the UI has to say so — an aggregator's guess must not read like the
    // vendor's own word.
    expect(PROBE_TARGETS.find((t) => t.id === 'tly')!.status).toMatchObject({ official: false });
  });

  it('links nowhere rather than somewhere wrong', () => {
    // is.gd is the case that sets the rule: the outage aggregators covering it
    // were observed reporting it down while it was serving requests. A
    // confidently wrong answer is worse than no answer.
    for (const id of ['isgd', 'allorigins', 'corssh', 'control']) {
      expect(PROBE_TARGETS.find((t) => t.id === id)!.status).toBeNull();
    }
  });

  it('probes a real endpoint on the API connectors, not a bare host root', () => {
    // The bug this pins. `api.raindrop.io/` answers 301 and `api.dropboxapi.com/`
    // answers 404 — neither carries `Access-Control-Allow-Origin`, because a
    // redirect and a generic 404 have no reason to. Probing those made the
    // doctor report "this host needs a CORS proxy" for two APIs the app talks to
    // directly and successfully, which is the single most confusing thing this
    // page can say: it contradicts a connector the user can see working.
    //
    // A path is the fix. It does not have to succeed — a readable 401 answers
    // the question perfectly — it only has to be a URL the API actually serves.
    const needPaths = ['raindrop', 'dropbox', 'tly'];
    for (const id of needPaths) {
      const target = PROBE_TARGETS.find((t) => t.id === id);
      expect(target, id).toBeDefined();
      const path = new URL(target!.probeUrl).pathname;
      expect(path, `${id} probes a bare root`).not.toBe('/');
    }
  });

  it('every target states a status page or explicitly states it has none', () => {
    // `status` is required, so a new connector cannot quietly ship without
    // someone having looked for its status page.
    for (const target of PROBE_TARGETS) {
      expect(target.status === null || typeof target.status.url === 'string').toBe(true);
      if (target.status) {
        expect(target.status.url).toMatch(/^https:\/\//);
        expect(target.status.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('classifyProxyStatus', () => {
  // The reported bug: probing api.twitterapi.io through a working proxy returned
  // a readable `{"error":"Unauthorized","message":"Missing API key..."}` and the
  // page announced "this service refused the request coming from it. Proxies run
  // in datacentres..." — sending the user to hunt for a different proxy over a
  // reply that proved the proxy was working perfectly.
  it('reads an auth failure as proof the round trip worked', () => {
    expect(classifyProxyStatus(401)).toBe('works');
    expect(classifyProxyStatus(403)).toBe('works');
    expect(classifyProxyStatus(402)).toBe('works');
  });

  it('reads a 2xx or 3xx as working', () => {
    expect(classifyProxyStatus(200)).toBe('works');
    expect(classifyProxyStatus(204)).toBe('works');
    expect(classifyProxyStatus(302)).toBe('works');
  });

  it('reads a wrong-path or wrong-method reply as working', () => {
    // Several probes are endpoints that want POST, or roots with no handler.
    // The target parsed the request well enough to say so, which is the point.
    expect(classifyProxyStatus(404)).toBe('works');
    expect(classifyProxyStatus(405)).toBe('works');
  });

  it('reads rate limiting as working, since we were plainly received', () => {
    expect(classifyProxyStatus(429)).toBe('works');
  });

  it('still reports a server-side failure as the target refusing', () => {
    expect(classifyProxyStatus(500)).toBe('target-refused');
    expect(classifyProxyStatus(502)).toBe('target-refused');
    expect(classifyProxyStatus(522)).toBe('target-refused');
  });
});

describe('timingHint', () => {
  it('reads an instant failure as the request never leaving the browser', () => {
    // The one failure shape that points at something installed locally rather
    // than at the network, which is worth separating precisely because the
    // remedy is different.
    const hint = timingHint(result('failed', 'unknown', 3), translate)!;
    expect(hint).toContain('too fast for anything to have gone out');
    expect(hint).toContain('3ms');
  });

  it('does not call an ordinary round-trip refusal a local block', () => {
    // Measured against real hosts: a refusal from a nearby server lands around
    // 50-350ms. Calling that "an extension blocked it" sends the reader after
    // software that is not there.
    for (const ms of [68, 83, 342]) {
      expect(timingHint(result('failed', 'unknown', ms), translate)).toContain('one round trip');
    }
  });

  it('reads a slow failure as something along the path refusing', () => {
    expect(timingHint(result('failed', 'unknown', 800), translate)).toContain(
      'reached something that refused it',
    );
  });

  it('reads a timeout as silent discard', () => {
    expect(timingHint(result('timeout', 'unknown', 8000), translate)).toContain(
      'discarded silently',
    );
  });

  it('flags a host that works but is slow enough to feel broken', () => {
    // AllOrigins is exactly this case, and a green row alone would mislead.
    expect(timingHint(result('reachable', 'readable', 6200), translate)).toContain('6.2s');
  });

  it('says nothing when the timing adds nothing', () => {
    // A hint on every row is noise, and noise is how a diagnostic stops being
    // read at all.
    expect(timingHint(result('reachable', 'readable', 210), translate)).toBeNull();
    expect(timingHint(result('idle', 'unknown', null), translate)).toBeNull();
  });
});

describe('corsHint', () => {
  it('explains that a blocked read is the host’s decision, not a local setting', () => {
    const hint = corsHint(result('reachable', 'blocked', 300), translate)!;
    expect(hint).toMatch(/host's policy/);
    // The load-bearing claim: nothing installed on this side changes it, which
    // is why the extension advice is wrong.
    expect(hint).toContain('no browser setting can grant it');
  });

  it('admits a blocked verdict describes one URL, not the whole API', () => {
    // An API can answer differently per path — `api.raindrop.io/` redirects
    // without CORS headers while `/rest/v1/collections` answers with them. A
    // row that contradicts a connector the user can see working needs to say
    // which of the two to believe.
    const hint = corsHint(result('reachable', 'blocked', 300), translate)!;
    expect(hint).toMatch(/single URL|one URL/);
    expect(hint).toMatch(/believe the connector/);
  });

  it('says a readable host needs no proxy', () => {
    expect(corsHint(result('reachable', 'readable', 300), translate)).toContain('no proxy needed');
  });

  it('refuses to mention CORS for a host that was never reached', () => {
    // Naming CORS here would invite exactly the wrong fix for a network block.
    expect(corsHint(result('failed', 'unknown', 50), translate)).toBeNull();
    expect(corsHint(result('timeout', 'unknown', 8000), translate)).toBeNull();
  });
});

describe('proxyHint', () => {
  it('points past the network when the proxy got through', () => {
    // The whole reason for the third leg: proving the bytes can make the round
    // trip eliminates network, proxy and CORS at once, which turns an
    // unbounded "could not reach the service" into "check your key".
    const hint = proxyHint(
      result('reachable', 'blocked', 200, 'works', 640),
      'AllOrigins',
      translate,
    )!;
    expect(hint).toContain('AllOrigins');
    expect(hint).toContain('640ms');
    expect(hint).toContain('an API key, a plan or credit limit, or a consent');
  });

  it('separates a healthy proxy the target refused from a broken one', () => {
    const refused = proxyHint(
      result('reachable', 'blocked', 200, 'target-refused', 300),
      'CORS.SH',
      translate,
    )!;
    expect(refused).toContain('refused the request coming from it');
    // The actionable part: retrying will not help, a different proxy might.
    expect(refused).toContain('datacentres');

    const dead = proxyHint(
      result('reachable', 'blocked', 200, 'proxy-unreachable', 8000),
      'CORS.SH',
      translate,
    )!;
    expect(dead).toContain('could not be reached at all');
  });

  it('says so when there is no proxy to try', () => {
    expect(proxyHint(result('reachable', 'blocked', 200, 'none'), null, translate)).toContain(
      'none is configured',
    );
  });

  it('stays quiet for a host that never needed a proxy', () => {
    expect(
      proxyHint(result('reachable', 'readable', 200, 'not-needed'), 'AllOrigins', translate),
    ).toBeNull();
    expect(
      proxyHint(result('failed', 'unknown', 50, 'unknown'), 'AllOrigins', translate),
    ).toBeNull();
  });
});

describe('interpret', () => {
  it('clears the network when the page loads but the request does not', () => {
    // The pairing that carries information neither half has alone, and the
    // reason the self-report step exists at all.
    const reading = interpret('failed', 'loaded', translate);
    expect(reading).toContain('CORS');
    expect(reading).toContain('reachable');
  });

  it('names the network when the user saw a block page', () => {
    expect(interpret('failed', 'block-page', translate)).toContain(
      'filtering this host on purpose',
    );
  });

  it('clears the network on a bot check, and says clicking through will not fix it', () => {
    // The outcome that neither "loaded" nor "blocked" covers: the host is
    // answering, so the network is exonerated, but the connector still cannot
    // work — and the user will otherwise pass the challenge, see the site, and
    // reasonably expect the app to start working.
    const reading = interpret('failed', 'bot-check', translate);
    expect(reading).toContain('your network is fine');
    expect(reading).toContain('keep failing even after you clear the challenge');
  });

  it('treats a bot check as a non-issue when the request got through anyway', () => {
    const reading = interpret('reachable', 'bot-check', translate);
    expect(reading).toContain('Nothing to do');
  });

  it('never claims certainty about a silent drop', () => {
    // A firewall discarding packets and a slow host are genuinely
    // indistinguishable, and the copy has to say so.
    expect(interpret('timeout', 'timed-out', translate)).toContain('looks the same');
  });
});

describe('rowOutcome', () => {
  /**
   * Object-override rather than the positional `result` above: these assertions
   * turn on the *combination* of cors and proxy, and naming the fields is what
   * makes each case readable.
   */
  function probe(over: Partial<ProbeResult>): ProbeResult {
    return {
      verdict: 'reachable',
      cors: 'readable',
      proxy: 'not-needed',
      ms: 100,
      proxyMs: null,
      ...over,
    };
  }

  /**
   * The reported bug, stated as a test. A host that is unreadable directly but
   * fetched fine through the configured proxy rendered amber ("blocked") beside
   * green ("proxy works") — two true statements that together scan as "is this
   * okay or not?". Reached through a relay is still reached.
   */
  it('is usable when a proxy got through, even though CORS blocked', () => {
    const proxied = probe({ cors: 'blocked', proxy: 'works', proxyMs: 250 });

    expect(rowOutcome(proxied)).toBe('usable');
    // And the headline names the route, because "works directly" and "works via
    // a proxy" fail differently later.
    expect(outcomeLabel(rowOutcome(proxied), proxied, translate)).toBe('Working (via proxy)');
  });

  it('is usable, unqualified, when the host is directly readable', () => {
    const direct = probe({});

    expect(rowOutcome(direct)).toBe('usable');
    expect(outcomeLabel(rowOutcome(direct), direct, translate)).toBe('Working');
  });

  // Amber is for the state the reader can act on, and only that state.
  it('needs setup when nothing has been configured to reach it', () => {
    expect(rowOutcome(probe({ cors: 'blocked', proxy: 'none' }))).toBe('needs-setup');
    expect(rowOutcome(probe({ cors: 'blocked', proxy: 'not-routable' }))).toBe('needs-setup');
  });

  /** Yellow/red, per the user's framing: bad news and worse news. */
  it('is unusable when the proxy tried and could not rescue it', () => {
    expect(rowOutcome(probe({ cors: 'blocked', proxy: 'target-refused' }))).toBe('unusable');
    expect(rowOutcome(probe({ cors: 'blocked', proxy: 'proxy-unreachable' }))).toBe('unusable');
  });

  it('is unusable when the host never answered at all', () => {
    expect(rowOutcome(probe({ verdict: 'failed', cors: 'unknown', proxy: 'unknown' }))).toBe(
      'unusable',
    );
    expect(rowOutcome(probe({ verdict: 'timeout', cors: 'unknown', proxy: 'unknown' }))).toBe(
      'unusable',
    );
  });

  it('is untested before a run and while in flight', () => {
    expect(rowOutcome(probe({ verdict: 'idle', cors: 'unknown', proxy: 'unknown' }))).toBe(
      'untested',
    );
    expect(rowOutcome(probe({ verdict: 'checking', cors: 'unknown', proxy: 'unknown' }))).toBe(
      'untested',
    );
  });

  // The other half of the mixed signal: once a proxy has solved it, the CORS
  // line explains the route instead of restating an open problem.
  it('stops diagnosing CORS once the proxy has solved it', () => {
    const hint = corsHint(probe({ cors: 'blocked', proxy: 'works' }), translate);

    expect(hint).toContain('goes through your proxy');
    expect(hint).not.toContain('Access-Control-Allow-Origin');
  });
});

describe('probe URLs', () => {
  /**
   * The reported bug: is.gd's probe pointed at `https://is.gd/`, which answers
   * 403 behind a bot-detection challenge, so a working shortener was reported as
   * blocked. The rule it broke — probe the API, not the website — is worth
   * pinning, because the homepage is always the tempting thing to reach for.
   *
   * `openUrl` is deliberately exempt: that one *is* meant to be a human page.
   */
  /**
   * The rule is "probe the API, not the website", and the distinction that
   * matters is the *host*, not the path: `api.github.com/` is a documented API
   * index that answers JSON with permissive CORS, while `is.gd/` was a marketing
   * page behind a bot check. A bare root is therefore fine on a dedicated API
   * host and never fine on a host that also serves a website to humans.
   */
  it('never probes the root of a host that serves a human website', () => {
    for (const target of PROBE_TARGETS) {
      const url = new URL(target.probeUrl);
      const isBareRoot = url.pathname === '/' && !url.search;
      // Dedicated API hosts, plus the two honest exceptions: example.com has
      // nothing but a root, and a proxy's probe URL *is* the proxied request.
      const apiHost = /^(api|public\.api)\./.test(url.host);
      const exempt = target.category === 'control' || target.category === 'proxy' || apiHost;
      expect(
        isBareRoot && !exempt,
        `${target.id} probes the root of a website host: ${target.probeUrl}`,
      ).toBe(false);
    }
  });

  /**
   * The is.gd regression, pinned by name. It is the one probe URL in the catalog
   * whose host serves a website at `/`, so it is the one most likely to drift
   * back to the homepage on a future edit.
   */
  it('probes the is.gd API rather than its bot-checked homepage', () => {
    const isgd = PROBE_TARGETS.find((t) => t.id === 'isgd')!;

    expect(new URL(isgd.probeUrl).pathname).not.toBe('/');
    expect(isgd.probeUrl).toContain('is.gd/');
    // The human page still belongs in openUrl: the tab test wants something a
    // person can read, and a block page is unmistakable there.
    expect(isgd.openUrl).toBe('https://is.gd');
  });

  it('probes only over https, so a probe cannot be silently downgraded', () => {
    for (const target of PROBE_TARGETS) {
      expect(target.probeUrl.startsWith('https://')).toBe(true);
    }
  });
});

describe('a host reachable only through the proxy', () => {
  /**
   * The reported bug: the doctor said api.short.io was "blocked or unreachable",
   * and shortening a link through the configured proxy worked on the very next
   * screen. Both were true — the browser cannot reach that host directly — but
   * the page answered a question nobody asked and got the useful one wrong.
   *
   * The cause was structural: a failed direct probe returned immediately, on the
   * reasoning that an unreachable host says nothing about the proxy. It says
   * nothing about the *host*, but it is precisely the situation a proxy exists
   * for, so the proxy leg now runs and its answer decides the row.
   */
  it('is usable when the direct leg failed but the proxy got through', () => {
    const viaProxyOnly: ProbeResult = {
      verdict: 'failed',
      cors: 'unknown',
      proxy: 'works',
      ms: 40,
      proxyMs: 300,
    };

    expect(rowOutcome(viaProxyOnly)).toBe('usable');
    expect(outcomeLabel(rowOutcome(viaProxyOnly), viaProxyOnly, translate)).toBe(
      'Working (via proxy)',
    );
  });

  // The copy must not claim the path is clear when the direct leg is broken —
  // this connector now depends on the proxy staying up, and that is worth saying.
  it('says the connector depends on the proxy, not that everything is fine', () => {
    const hint = proxyHint(
      { verdict: 'failed', cors: 'unknown', proxy: 'works', ms: 40, proxyMs: 300 },
      'AllOrigins',
      translate,
    );

    expect(hint).toContain('could not reach this host directly');
    expect(hint).not.toContain('Everything between you and this service is fine');
  });

  it('still reports a genuinely unreachable host as unusable', () => {
    // No proxy configured, so nothing rescued it and nothing has changed here.
    expect(
      rowOutcome({ verdict: 'failed', cors: 'unknown', proxy: 'none', ms: 40, proxyMs: null }),
    ).toBe('unusable');
    expect(
      rowOutcome({
        verdict: 'failed',
        cors: 'unknown',
        proxy: 'proxy-unreachable',
        ms: 40,
        proxyMs: 90,
      }),
    ).toBe('unusable');
  });
});
