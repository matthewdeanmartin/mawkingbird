import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorsProxySettings } from '../../../../providers/cors-proxy/cors-proxy-settings';
import { Server } from '../../../../server';
import { ConnectionDoctorPage } from './connection-doctor-page';
import { probeTargets } from './connection-doctor-catalog';
import { enableProxyFlags } from '../../../../testing/enable-proxy-flags';
import { translocoTesting } from '../../../../i18n/i18n.testing';

const PROBE_TARGETS = probeTargets((key: string) => key);

describe('ConnectionDoctorPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [provideRouter([])],
    });
    // These specs use a third-party proxy as the vehicle for testing proxy
    enableProxyFlags();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setUp(): ComponentFixture<ConnectionDoctorPage> {
    const fixture = TestBed.createComponent(ConnectionDoctorPage);
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<ConnectionDoctorPage>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(fixture: ComponentFixture<ConnectionDoctorPage>): HTMLElement[] {
    return [...el(fixture).querySelectorAll<HTMLElement>('.doc-row')];
  }

  function rowFor(fixture: ComponentFixture<ConnectionDoctorPage>, host: string): HTMLElement {
    return rows(fixture).find((row) => row.textContent?.includes(host))!;
  }

  async function check(fixture: ComponentFixture<ConnectionDoctorPage>): Promise<void> {
    el(fixture).querySelector<HTMLButtonElement>('.doc-run button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lists every host before anything has been checked', () => {
    const fixture = setUp();
    // The list is the point even unchecked: it is also the answer to "what
    // does this app talk to?".
    expect(rows(fixture)).toHaveLength(PROBE_TARGETS.length);
    expect(el(fixture).textContent).toContain('Not checked');
  });

  it('includes the Mastodon server you are actually on', () => {
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    const fixture = setUp();

    expect(rows(fixture)).toHaveLength(PROBE_TARGETS.length + 1);
    expect(rowFor(fixture, 'mastodon.social').textContent).toContain('Your Mastodon server');
  });

  it('checks every host and reports each verdict', async () => {
    const fixture = setUp();
    await check(fixture);

    // Two per host: reachability, then readability. No third leg here, since
    // everything is readable and a proxy would add nothing.
    expect(fetchMock).toHaveBeenCalledTimes(PROBE_TARGETS.length * 2);
    // The headline answers "can I use this?", not "did bytes arrive" — a
    // directly-readable host is plainly "Working".
    expect(rowFor(fixture, 'openrouter.ai').textContent).toContain('Working');
    expect(el(fixture).textContent).toContain(`${PROBE_TARGETS.length} working`);
  });

  it('offers the tab test only for hosts that failed', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('openrouter.ai')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    const fixture = setUp();
    await check(fixture);

    // A green row has nothing left to diagnose; offering the follow-up there
    // would just be noise on fifteen rows.
    expect(rowFor(fixture, 'openrouter.ai').textContent).toContain('Open openrouter.ai in a tab');
    expect(rowFor(fixture, 'api.github.com').textContent).not.toContain('in a tab');
  });

  it('interprets the JS verdict together with what the user saw', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('openrouter.ai')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const fixture = setUp();
    await check(fixture);

    const row = rowFor(fixture, 'openrouter.ai');
    row.querySelector<HTMLButtonElement>('.doc-followup button')!.click();
    fixture.detectChanges();

    // Handing a possibly hostile intermediary a handle on the app is a poor
    // trade for a diagnostic tab.
    expect(openSpy).toHaveBeenCalledWith('https://openrouter.ai', '_blank', 'noopener,noreferrer');

    const loaded = [
      ...rowFor(fixture, 'openrouter.ai').querySelectorAll<HTMLInputElement>('.doc-report input'),
    ].find((input) => input.value === 'loaded')!;
    loaded.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // The payoff: page loads + request fails rules the network out entirely.
    const reading = rowFor(fixture, 'openrouter.ai').querySelector('.doc-interpretation');
    expect(reading?.textContent).toContain('CORS');
  });

  it('offers the bot-check outcome, and reads it as a service problem not a network one', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('is.gd')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    vi.stubGlobal('open', vi.fn());
    const fixture = setUp();
    await check(fixture);

    rowFor(fixture, 'is.gd').querySelector<HTMLButtonElement>('.doc-followup button')!.click();
    fixture.detectChanges();

    const botCheck = [
      ...rowFor(fixture, 'is.gd').querySelectorAll<HTMLInputElement>('.doc-report input'),
    ].find((input) => input.value === 'bot-check')!;
    expect(botCheck).toBeDefined();
    botCheck.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // A Cloudflare interstitial exonerates the network while still meaning the
    // connector is dead — the one pairing the other five answers cannot state.
    const reading = rowFor(fixture, 'is.gd').querySelector('.doc-interpretation');
    expect(reading?.textContent).toContain('your network is fine');
  });

  it('names the CORS-blocked hosts and argues against the extension fix', async () => {
    // Reachable, but refusing to be read — the population a proxy is for.
    fetchMock.mockImplementation((url: string, init: RequestInit) =>
      init.mode === 'cors' && url.includes('openrouter.ai')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    const fixture = setUp();
    await check(fixture);

    const text = el(fixture).textContent ?? '';
    expect(text).toContain('About "just disable CORS"');
    // The specific host is named, since "which domains?" is the question asked.
    expect(el(fixture).querySelector('.doc-cors-list')?.textContent).toContain('openrouter.ai');
    // And the answer to it: there is nothing to whitelist, because the refusal
    // is made on their server.
    expect(text).toContain('nothing to whitelist');
    expect(text).toContain('bank and your webmail');
  });

  it('keeps the CORS advice off the page when nothing is CORS-blocked', async () => {
    const fixture = setUp();
    await check(fixture);
    expect(el(fixture).textContent).not.toContain('About “just disable CORS”');
  });

  it('never blames CORS for a host it could not reach', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const fixture = setUp();
    await check(fixture);

    // A red row failed the reachability question, where CORS never applied —
    // and saying otherwise is what sends people to a fix that cannot work.
    expect(el(fixture).querySelector('.doc-cors-list')).toBeNull();
    expect(rowFor(fixture, 'openrouter.ai').querySelector('.doc-cors')).toBeNull();
  });

  it('shows how long each host took, and what an instant failure suggests', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('openrouter.ai')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    const fixture = setUp();
    await check(fixture);

    const row = rowFor(fixture, 'openrouter.ai');
    expect(row.querySelector('.doc-timing')?.textContent).toMatch(/\d+(ms|\.\ds)/);
    // A mocked rejection returns immediately, which is the local-blocker shape.
    expect(row.querySelector('.doc-timing-hint')?.textContent).toContain(
      'too fast for anything to have gone out',
    );
  });

  it('keeps the control host out of the proxy advice', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      init.mode === 'cors'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    const fixture = setUp();
    await check(fixture);

    // example.com is CORS-blocked like most of the web, but it exists only to
    // prove the test works — advising a proxy for it is advice about a host
    // nobody will ever connect to.
    const named = el(fixture).querySelector('.doc-cors-list')?.textContent ?? '';
    expect(named).toContain('openrouter.ai');
    expect(named).not.toContain('example.com');
  });

  it('reports a working proxy as pointing past the network', async () => {
    TestBed.inject(CorsProxySettings).select('allorigins');
    fetchMock.mockImplementation((url: string, init: RequestInit) =>
      init.mode === 'cors' && !url.includes('allorigins.win/raw')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    const fixture = setUp();
    await check(fixture);

    expect(rowFor(fixture, 'api.raindrop.io').querySelector('.doc-proxy')?.textContent).toContain(
      'Confirmed working through',
    );
  });

  it('calls out hosts a healthy proxy could not rescue', async () => {
    TestBed.inject(CorsProxySettings).select('allorigins');
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.includes('allorigins.win')) {
        // Proxy origin is alive; proxied fetches fail.
        return init.mode === 'no-cors'
          ? Promise.resolve(new Response())
          : Promise.reject(new TypeError('Failed to fetch'));
      }
      return init.mode === 'cors'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response());
    });
    const fixture = setUp();
    await check(fixture);

    const text = el(fixture).textContent ?? '';
    expect(text).toContain("Hosts your proxy can't rescue");
    // The actionable distinction: not misconfigured, just blocklisted.
    expect(text).toContain('block those address ranges');
  });

  it('links each host to its status page, before anything is even checked', () => {
    const fixture = setUp();

    // Useful without running the sweep: "is GitHub down?" is a question worth
    // answering whether or not you just probed it.
    const link = rowFor(fixture, 'api.github.com').querySelector<HTMLAnchorElement>(
      '.doc-status a',
    );
    expect(link?.getAttribute('href')).toBe('https://www.githubstatus.com/');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.textContent).toContain('GitHub Status');
  });

  it('flags an aggregator link as third-party, and omits links it does not have', () => {
    const fixture = setUp();

    expect(rowFor(fixture, 'api.t.ly').querySelector('.doc-status-third')).not.toBeNull();
    // is.gd's aggregators were observed reporting it down while it was serving
    // requests, so it deliberately links nowhere.
    expect(rowFor(fixture, 'is.gd').querySelector('.doc-status')).toBeNull();
  });

  it('points a failed host at its status page as the first thing to rule out', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('openrouter.ai')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    const fixture = setUp();
    await check(fixture);

    const followup = rowFor(fixture, 'openrouter.ai').querySelector('.doc-followup-status');
    expect(followup?.textContent).toContain('worth ruling out an outage first');
    // The load-bearing inference: vendor says fine + we cannot reach it =
    // look at your own network.
    expect(followup?.textContent).toContain('more likely on your side');
  });

  it('says plainly when a failed host publishes no status page at all', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('is.gd')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    const fixture = setUp();
    await check(fixture);

    expect(rowFor(fixture, 'is.gd').querySelector('.doc-followup-status')?.textContent).toContain(
      'publishes no status page',
    );
  });

  it('warns that nothing is trustworthy when the control host fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const fixture = setUp();
    await check(fixture);

    expect(el(fixture).querySelector('.doc-control-warning')?.textContent).toContain('offline');
  });

  it('does not warn about the control when only one host is blocked', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('openrouter.ai')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response()),
    );
    const fixture = setUp();
    await check(fixture);

    expect(el(fixture).querySelector('.doc-control-warning')).toBeNull();
  });

  it('drops stale reports when the sweep is re-run', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('open', vi.fn());
    const fixture = setUp();
    await check(fixture);

    const row = rowFor(fixture, 'openrouter.ai');
    row.querySelector<HTMLButtonElement>('.doc-followup button')!.click();
    fixture.detectChanges();
    [...rowFor(fixture, 'openrouter.ai').querySelectorAll<HTMLInputElement>('.doc-report input')]
      .find((input) => input.value === 'block-page')!
      .dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(rowFor(fixture, 'openrouter.ai').querySelector('.doc-interpretation')).not.toBeNull();

    // An observation of the last sweep paired with a fresh verdict would state
    // a conclusion supported by neither.
    await check(fixture);
    expect(rowFor(fixture, 'openrouter.ai').querySelector('.doc-interpretation')).toBeNull();
  });
});
