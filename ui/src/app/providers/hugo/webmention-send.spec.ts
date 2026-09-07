import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CorsProxy, CorsProxyRefusal } from '../cors-proxy/cors-proxy';
import { WebmentionSend } from './webmention-send';

const TARGET = 'https://blog.example/posts/hello/';
const SOURCE = 'https://mistersql.github.io/mistersql/interactions/2026-08-06-1/';
const MASTODON = 'https://mastodon.social/@alice/109876';

/** A proxy that passes URLs straight through, so specs assert on real targets. */
function passthroughProxy(): void {
  TestBed.overrideProvider(CorsProxy, {
    useValue: {
      proxyRequest: (url: string) => ({ url, headers: { keys: () => [], get: () => null } }),
    },
  });
}

/** A browser with no proxy configured at all. */
function refusingProxy(): void {
  TestBed.overrideProvider(CorsProxy, {
    useValue: {
      proxyRequest: () => {
        throw new CorsProxyRefusal('No CORS proxy is configured.');
      },
    },
  });
}

function html(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers });
}

/** GETs answer discovery; POSTs answer delivery. */
function route(onGet: () => Response, onPost: () => Response | Promise<never>): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST' ? Promise.resolve(onPost() as Response) : Promise.resolve(onGet()),
  );
}

function posts(): { url: string; init: RequestInit }[] {
  return vi
    .mocked(fetch)
    .mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === 'POST')
    .map((call) => ({ url: String(call[0]), init: call[1] as RequestInit }));
}

describe('WebmentionSend', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('discovers an endpoint and posts source and target to it', async () => {
    passthroughProxy();
    route(
      () => html('<link rel="webmention" href="https://wm.example/e">'),
      () => new Response('', { status: 202 }),
    );

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    expect(result.state).toBe('delivered');
    expect(result.endpoint).toBe('https://wm.example/e');
    const [sent] = posts();
    expect(sent.url).toBe('https://wm.example/e');
    expect(sent.init.body).toBe(
      `source=${encodeURIComponent(SOURCE)}&target=${encodeURIComponent(TARGET)}`,
    );
  });

  it('treats 202 as accepted, not verified, and says so', async () => {
    passthroughProxy();
    route(
      () => html('<link rel="webmention" href="https://wm.example/e">'),
      () => new Response('', { status: 202 }),
    );

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    // Most endpoints verify asynchronously, so promising more would be a lie.
    expect(result.message).toContain('will verify');
  });

  it('reports no-endpoint for a Mastodon post, with nothing resembling an error', async () => {
    passthroughProxy();
    route(
      () => html('<html><body>a toot</body></html>'),
      () => new Response('', { status: 202 }),
    );

    const result = await TestBed.inject(WebmentionSend).send(MASTODON, SOURCE);

    // The expected outcome for every Mastodon target. It must never be dressed
    // up as success, and must never read as a failure.
    expect(result.state).toBe('no-endpoint');
    expect(result.message).toContain('does not accept webmentions');
    expect(result.message).toContain('published');
    expect(posts()).toHaveLength(0);
  });

  it('reports a refusal from a real endpoint as failed', async () => {
    passthroughProxy();
    route(
      () => html('<link rel="webmention" href="https://wm.example/e">'),
      () => new Response('bad source', { status: 400 }),
    );

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    expect(result.state).toBe('failed');
    expect(result.message).toContain('400');
  });

  it("surfaces the endpoint's own explanation instead of a bare status code", async () => {
    passthroughProxy();
    route(
      () => html('<link rel="webmention" href="https://webmention.io/example/webmention">'),
      () =>
        new Response(
          JSON.stringify({
            error: 'invalid_target',
            error_description: 'target domain not found on this account',
          }),
          { status: 404 },
        ),
    );

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    // The real failure Matthew hit. "HTTP 404" alone was unactionable; the
    // endpoint had already said exactly what was wrong.
    expect(result.state).toBe('failed');
    expect(result.message).toContain('target domain not found on this account');
    // And it names the endpoint and the target, so the URLs can be compared.
    expect(result.message).toContain('https://webmention.io/example/webmention');
    expect(result.message).toContain(TARGET);
    expect(result.message).toContain('trailing slash');
  });

  it('falls back to a plain status when the endpoint explains nothing', async () => {
    passthroughProxy();
    route(
      () => html('<link rel="webmention" href="https://wm.example/e">'),
      () => new Response('', { status: 500 }),
    );

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    expect(result.message).toContain('https://wm.example/e');
    expect(result.message).toContain('500');
  });

  it('does not quote an HTML error page as if it were an explanation', async () => {
    passthroughProxy();
    route(
      () => html('<link rel="webmention" href="https://wm.example/e">'),
      () => new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', { status: 502 }),
    );

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    expect(result.message).not.toContain('<html>');
    expect(result.message).toContain('502');
  });

  it('reports the endpoint alongside a refusal so it can be checked', async () => {
    passthroughProxy();
    route(
      () => html('<link rel="webmention" href="https://wm.example/e">'),
      () => new Response('nope', { status: 400 }),
    );

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    expect(result.endpoint).toBe('https://wm.example/e');
    expect(result.message).toContain('nope');
  });

  it('blames the proxy, not the target, when the POST cannot be made', async () => {
    passthroughProxy();
    route(
      () => html('<link rel="webmention" href="https://wm.example/e">'),
      () => Promise.reject(new TypeError('Failed to fetch')),
    );

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    // AllOrigins cannot forward a POST. That is a configuration limit, and
    // calling it `failed` would blame the wrong party.
    expect(result.state).toBe('unsupported');
    expect(result.message).toContain('proxy');
  });

  it('reports unsupported when no proxy is configured at all', async () => {
    refusingProxy();
    vi.spyOn(globalThis, 'fetch');

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    expect(result.state).toBe('unsupported');
    expect(result.message).toContain('CORS proxy');
    // And it says the durable half already happened.
    expect(result.message).toContain('published');
  });

  it('does not claim a failure when the target page cannot be read', async () => {
    passthroughProxy();
    route(
      () => new Response('nope', { status: 500 }),
      () => new Response('', { status: 202 }),
    );

    const result = await TestBed.inject(WebmentionSend).send(TARGET, SOURCE);

    // We genuinely do not know whether it accepts webmentions.
    expect(result.state).toBe('no-endpoint');
    expect(result.message).toContain('Could not check');
  });

  it('discovers each host once per batch', async () => {
    passthroughProxy();
    route(
      () => html('<link rel="webmention" href="https://wm.example/e">'),
      () => new Response('', { status: 202 }),
    );
    const sender = TestBed.inject(WebmentionSend);

    await sender.send(TARGET, SOURCE);
    await sender.send(TARGET, SOURCE);

    const gets = vi
      .mocked(fetch)
      .mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method !== 'POST');
    expect(gets).toHaveLength(1);
    expect(posts()).toHaveLength(2);
  });

  it('forgets endpoints between batches, so a new one is noticed', async () => {
    passthroughProxy();
    route(
      () => html('<html><body>no endpoint yet</body></html>'),
      () => new Response('', { status: 202 }),
    );
    const sender = TestBed.inject(WebmentionSend);
    await sender.send(TARGET, SOURCE);

    sender.resetCache();
    await sender.send(TARGET, SOURCE);

    // Persisting "this site has no endpoint" would outlive the day they add one.
    const gets = vi
      .mocked(fetch)
      .mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method !== 'POST');
    expect(gets).toHaveLength(2);
  });
});
