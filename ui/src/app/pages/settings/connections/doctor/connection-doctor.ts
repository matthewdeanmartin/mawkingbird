import { inject, Injectable, signal } from '@angular/core';
import { buildProxiedUrl } from '../../../../providers/cors-proxy/cors-proxy';
import { CorsProxySettings } from '../../../../providers/cors-proxy/cors-proxy-settings';
import { CorsReadable, ProbeResult, ProbeTarget, ProxyVerdict } from './connection-doctor-catalog';

/**
 * Runs the reachability probes.
 *
 * Deliberately a plain `fetch` rather than the app's `HttpClient`: the doctor
 * must work with no credentials, no interceptors and no proxy, precisely
 * because it is answering "would setting this up be a waste of my time?" before
 * any of those exist. It also needs `mode: 'no-cors'`, which `HttpClient`
 * cannot express.
 *
 * ## Two probes per host, and why
 *
 * Each host is asked two different questions, because they have different
 * answers and conflating them is what sends people to bad advice:
 *
 * 1. **`no-cors` — did the bytes arrive?** The response is opaque, so its mere
 *    existence is the answer. This is *reachability*, and nothing a browser
 *    extension does can change it.
 * 2. **`cors` — may this app read them?** Only meaningful if (1) succeeded. A
 *    failure here is the host declining to send `Access-Control-Allow-Origin`,
 *    which is a policy decision by that host, not a network fault.
 *
 * The pair is what makes the page able to say "your network is fine, that
 * service simply does not answer browsers" without asking the user anything —
 * and to correctly refuse to blame CORS when the host was never reached.
 *
 * A third leg runs only for hosts that failed (2) while passing (1), which is
 * exactly the population a CORS proxy exists for: **can the configured proxy
 * fetch it?** Answering that separates three failures the connector itself
 * reports identically — the proxy being blocked here, the *target* refusing the
 * proxy's datacentre IP, and everything working (which points the user at their
 * API key instead of at the network).
 *
 * ## On credentials
 *
 * The proxied leg builds its URL with {@link buildProxiedUrl} rather than going
 * through `CorsProxy.proxyRequest`, which would refuse most of these hosts by
 * design — they are on the credential-host blocklist precisely because the
 * app's *real* traffic to them carries tokens. That guard is not weakened here:
 * these probes are unauthenticated public URLs and carry no `Authorization`
 * header, so there is no secret to disclose. The only header sent is the
 * proxy's own key, which the proxy already has.
 *
 * Probes run in parallel. Fifteen hosts at eight seconds each would be two
 * minutes serially, and the browser's own connection limits already throttle
 * this to something reasonable.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionDoctor {
  private proxySettings = inject(CorsProxySettings);

  /** Result per target id. Absent means never run. */
  readonly results = signal<Readonly<Record<string, ProbeResult>>>({});
  readonly running = signal(false);
  /** When the last sweep finished, so the page can say how stale it is. */
  readonly lastRunAt = signal<number | null>(null);

  async runAll(targets: readonly ProbeTarget[], timeoutMs = 8000): Promise<void> {
    if (this.running()) {
      return;
    }
    this.running.set(true);
    // Reset in one write so every row turns over together rather than
    // trickling, which reads as the page being broken.
    this.results.set(
      Object.fromEntries(
        targets.map((t) => [
          t.id,
          {
            verdict: 'checking',
            cors: 'unknown',
            proxy: 'unknown',
            ms: null,
            proxyMs: null,
          } as ProbeResult,
        ]),
      ),
    );

    await Promise.all(
      targets.map(async (target) => {
        const result = await this.probe(target, timeoutMs);
        this.results.update((current) => ({ ...current, [target.id]: result }));
      }),
    );

    this.lastRunAt.set(Date.now());
    this.running.set(false);
  }

  /**
   * One host: reachability first, then readability.
   *
   * The CORS leg is skipped entirely when the host was never reached — a `cors`
   * request to an unreachable host fails for the same network reason, and
   * reporting that as "CORS blocked" would be exactly the misdiagnosis that
   * sends people installing extensions which cannot possibly help.
   */
  private async probe(target: ProbeTarget, timeoutMs: number): Promise<ProbeResult> {
    const started = performance.now();
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      await fetch(target.probeUrl, {
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        signal: timeout,
      });
      const ms = Math.round(performance.now() - started);
      const cors = await this.probeCors(target, timeoutMs);
      if (cors === 'readable') {
        // Directly readable: a proxy would add a hop and a middleman for
        // nothing, so there is no question left to ask.
        return { verdict: 'reachable', cors, proxy: 'not-needed', ms, proxyMs: null };
      }
      const { proxy, proxyMs } = await this.probeViaProxy(target, timeoutMs);
      return { verdict: 'reachable', cors, proxy, ms, proxyMs };
    } catch {
      const ms = Math.round(performance.now() - started);
      const verdict = timeout.aborted ? ('timeout' as const) : ('failed' as const);
      // The direct request did not arrive. That used to end the enquiry, on the
      // reasoning that a host we cannot reach tells us nothing about the proxy —
      // but it gets the practical question backwards and produced a flatly wrong
      // answer for the user.
      //
      // Observed: the doctor reported api.short.io "blocked or unreachable",
      // while shortening a link through the configured proxy worked on the very
      // next screen. The direct leg failing is not evidence the *feature* fails;
      // it is evidence the browser cannot go straight there, which is the exact
      // situation a proxy exists for.
      //
      // So the proxy is still asked. It is a hop that does not depend on this
      // browser reaching the host at all, and its answer is the one that decides
      // whether the connector can work. The verdict below stays `failed` —
      // nothing here reaches the host directly — but the row can now say "not
      // directly, but your proxy gets there", which is the truth and is
      // actionable.
      const { proxy, proxyMs } = await this.probeViaProxy(target, timeoutMs);
      return { verdict, cors: 'unknown', proxy, ms, proxyMs };
    }
  }

  /**
   * Can the configured proxy fetch what this browser cannot?
   *
   * Distinguishing "the proxy is blocked" from "the target refused the proxy"
   * needs a second data point, so a proxy failure is followed by a probe of the
   * proxy's *own* host. If that is reachable, the proxy is alive and the target
   * is what turned it away — which is common, since services block datacentre
   * IP ranges far more readily than residential ones.
   */
  private async probeViaProxy(
    target: ProbeTarget,
    timeoutMs: number,
  ): Promise<{ proxy: ProxyVerdict; proxyMs: number | null }> {
    const config = this.proxySettings.resolve();
    if (!config) {
      return { proxy: 'none', proxyMs: null };
    }

    // A destination-restricting proxy can only be asked about hosts it has a
    // route for. Sending one of the others would get a correct 403 from our own
    // allowlist, which this page would then report as the *target* refusing the
    // proxy — blaming a third party for our policy.
    if (config.entry.template.routed && !target.proxyRoute) {
      return { proxy: 'not-routable', proxyMs: null };
    }

    const proxiedUrl = buildProxiedUrl(config, target.probeUrl, target.proxyRoute);
    const started = performance.now();
    try {
      // `cors` mode, deliberately: the entire point of a proxy is that its
      // reply is readable, so an opaque success would not answer the question.
      const response = await fetch(proxiedUrl, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        // The proxy's own key, when it has one. Never the target's — these
        // probes are unauthenticated by construction.
        headers: config.header ? { [config.header.name]: config.header.value } : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const proxyMs = Math.round(performance.now() - started);
      return { proxy: classifyProxyStatus(response.status), proxyMs };
    } catch {
      const proxyMs = Math.round(performance.now() - started);
      return { proxy: await this.classifyProxyFailure(proxiedUrl, timeoutMs), proxyMs };
    }
  }

  /** Was it the proxy that was unreachable, or the target that refused it? */
  private async classifyProxyFailure(proxiedUrl: string, timeoutMs: number): Promise<ProxyVerdict> {
    try {
      await fetch(new URL(proxiedUrl).origin, {
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      // The proxy's host is reachable, so the failure was about this target.
      return 'target-refused';
    } catch {
      return 'proxy-unreachable';
    }
  }

  /**
   * Can this origin actually *read* the host's replies?
   *
   * A plain `cors`-mode GET. If it resolves, the host sent an
   * `Access-Control-Allow-Origin` covering us and the app can talk to it
   * directly. If it throws — having already proven reachable — the only
   * remaining explanation is that the host declined to, which is the one
   * failure a CORS proxy exists to solve.
   *
   * An HTTP error status still counts as readable: a readable 404 means the
   * browser was allowed to see the response, which is the question being asked.
   */
  private async probeCors(target: ProbeTarget, timeoutMs: number): Promise<CorsReadable> {
    try {
      await fetch(target.probeUrl, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return 'readable';
    } catch {
      return 'blocked';
    }
  }
}

/**
 * What an HTTP status from the *proxied* leg actually proves.
 *
 * The subtlety worth naming: **a status only exists at all if the round trip
 * worked.** For the browser to read `401`, the proxy had to accept the request,
 * reach the target, get an answer, and relay it with CORS headers the browser
 * honoured. Every one of those is the thing this leg is testing.
 *
 * The earlier code was `response.ok ? 'works' : 'target-refused'`, which read
 * every non-2xx as a refusal — and so reported a perfectly working proxy as
 * "this service refused the request coming from it", telling the user to go
 * find a different proxy for a problem that did not exist.
 *
 * These probes are **unauthenticated by construction**: the doctor exists to be
 * run before you have any keys. So on an API host, `401` and `403` are the
 * *expected* replies and are evidence of success. A genuine datacentre-range
 * block looks different — it is usually a network failure or an HTML block page
 * under 5xx, not a JSON "missing API key".
 *
 * Exported for testing: the mapping is the whole behaviour, and it is worth
 * pinning per status rather than through a fixture.
 */
export function classifyProxyStatus(status: number): ProxyVerdict {
  // The target replied and the browser read it. That is a working proxy,
  // whatever the target thought of the request.
  if (status < 400) {
    return 'works';
  }

  // Authentication and authorization failures prove the request arrived and was
  // understood. An unauthenticated probe *should* get these.
  if (status === 401 || status === 403 || status === 402) {
    return 'works';
  }

  // 404 and 405 likewise: the target parsed the request well enough to say the
  // path or method was wrong. Several probe URLs are bare API roots that have no
  // handler, so this is routine.
  if (status === 404 || status === 405 || status === 410) {
    return 'works';
  }

  // 429 is the target rate-limiting us, which again means it received us.
  if (status === 429) {
    return 'works';
  }

  // What is left is a proxy-shaped failure: 5xx, or the proxy's own error
  // envelope reporting it could not complete the fetch.
  return 'target-refused';
}
