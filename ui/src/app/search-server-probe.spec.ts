import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTagsOnly, isUsableSearchServer, probeSearchServer } from './search-server-probe';

/** Minimal stand-in for the bits of Response the probe reads. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('probeSearchServer', () => {
  it('reports ok when the canary search returns accounts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ accounts: [{ id: '1' }, { id: '2' }] })),
    );

    const result = await probeSearchServer('https://mastodon.social');

    expect(result.status).toBe('ok');
    expect(result.accounts).toBe(2);
  });

  it('hits the search endpoint anonymously on the given base URL', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return jsonResponse({ accounts: [{ id: '1' }] });
      }),
    );

    await probeSearchServer('https://example.social');

    expect(urls[0]).toContain('https://example.social/api/v2/search');
    expect(urls[0]).toContain('type=accounts');
  });

  it('reports auth-required when the server refuses anonymous search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401)),
    );

    expect((await probeSearchServer('https://closed.example')).status).toBe('auth-required');
  });

  it('treats 422 as auth-required (some builds use it for token-only endpoints)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, 422)),
    );

    expect((await probeSearchServer('https://closed.example')).status).toBe('auth-required');
  });

  it('reports no-results when a reachable server has an empty index', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ accounts: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeSearchServer('https://empty.example');

    expect(result.status).toBe('no-results');
    // A second canary is tried before giving up, so one unlucky query isn't fatal.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('accepts a server whose second canary query is the one that hits', async () => {
    const pages = [jsonResponse({ accounts: [] }), jsonResponse({ accounts: [{ id: '7' }] })];
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pages[call++]),
    );

    expect((await probeSearchServer('https://partial.example')).status).toBe('ok');
  });

  it('reports unreachable when the request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network');
      }),
    );

    expect((await probeSearchServer('https://nope.example')).status).toBe('unreachable');
  });

  // --- the post canary: hashtags, because nothing serves full text anonymously ---

  it('asks for posts by hashtag, not by bare word', async () => {
    // The whole point of the revision: no server in the directory answers an
    // anonymous full-text query, so a bare-word probe rejects every candidate.
    const queries: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        queries.push(new URL(url).searchParams.get('q') ?? '');
        return jsonResponse({ accounts: [{ id: '1' }], statuses: [{ id: '9' }] });
      }),
    );

    const result = await probeSearchServer('https://good.example');

    expect(queries[0]).toBe('Gargron');
    expect(queries[1]).toMatch(/^#/);
    expect(result.statuses).toBe(1);
    expect(isUsableSearchServer(result)).toBe(true);
  });

  it('leaves the type off the post canary so a tags-only answer is visible', async () => {
    // type=statuses would make a tags-only server return an empty payload, hiding
    // the difference between "recognised the tag" and "said nothing".
    const types: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        types.push(new URL(url).searchParams.get('type'));
        return jsonResponse({ accounts: [{ id: '1' }], statuses: [{ id: '9' }] });
      }),
    );

    await probeSearchServer('https://good.example');

    expect(types).toEqual(['accounts', null]);
  });

  it('tries a second hashtag before writing a server off', async () => {
    // A rejection is persisted, so one quiet tag must not cost a usable server.
    const byQuery = (q: string) =>
      q === '#mastodon'
        ? jsonResponse({ statuses: [], hashtags: [] })
        : jsonResponse({ statuses: [{ id: '9' }], hashtags: [{ name: 'news' }] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const params = new URL(url).searchParams;
        return params.get('type') === 'accounts'
          ? jsonResponse({ accounts: [{ id: '1' }] })
          : byQuery(params.get('q') ?? '');
      }),
    );

    const result = await probeSearchServer('https://quiet-tag.example');

    expect(result.statuses).toBe(1);
    expect(isUsableSearchServer(result)).toBe(true);
  });

  it('rejects the server that answers a hashtag with the tag and no posts', async () => {
    // The failure that looks most like success: a 200 carrying a plausible payload
    // with nothing in it to read.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new URL(url).searchParams.get('type') === 'accounts'
          ? jsonResponse({ accounts: [{ id: '1' }] })
          : jsonResponse({ statuses: [], hashtags: [{ name: 'mastodon' }] }),
      ),
    );

    const result = await probeSearchServer('https://tags-only.example');

    expect(result.status).toBe('ok');
    expect(result.accounts).toBe(1);
    expect(result.statuses).toBe(0);
    expect(result.hashtags).toBe(1);
    expect(isTagsOnly(result)).toBe(true);
    // Reachable and useful for accounts, but not adoptable as a search server.
    expect(isUsableSearchServer(result)).toBe(false);
  });

  it('separates a silent server from a tags-only one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new URL(url).searchParams.get('type') === 'accounts'
          ? jsonResponse({ accounts: [{ id: '1' }] })
          : jsonResponse({ statuses: [], hashtags: [] }),
      ),
    );

    const result = await probeSearchServer('https://silent.example');

    expect(result.statuses).toBe(0);
    expect(result.hashtags).toBe(0);
    expect(isTagsOnly(result)).toBe(false);
    expect(isUsableSearchServer(result)).toBe(false);
  });

  it('spends nothing on a post probe when the server refused account search', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 403));
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeSearchServer('https://closed.example');

    expect(result.statuses).toBeNull();
    expect(result.hashtags).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('records a refused post probe as zero, not as "never asked"', async () => {
    // The distinction matters: the host answered accounts, so this is a finding
    // about its post search, not missing information.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new URL(url).searchParams.get('type') === 'accounts'
          ? jsonResponse({ accounts: [{ id: '1' }] })
          : jsonResponse({}, 401),
      ),
    );

    expect((await probeSearchServer('https://half.example')).statuses).toBe(0);
  });
});

describe('isUsableSearchServer', () => {
  it('requires both halves of search to work', () => {
    expect(isUsableSearchServer({ status: 'ok', accounts: 3, statuses: 5, hashtags: 1 })).toBe(
      true,
    );
    expect(isUsableSearchServer({ status: 'ok', accounts: 3, statuses: 0, hashtags: 1 })).toBe(
      false,
    );
    expect(isUsableSearchServer({ status: 'ok', accounts: 0, statuses: 5, hashtags: 1 })).toBe(
      false,
    );
    expect(
      isUsableSearchServer({
        status: 'auth-required',
        accounts: 0,
        statuses: null,
        hashtags: null,
      }),
    ).toBe(false);
  });

  it('does not accept a matching hashtag as a substitute for posts', () => {
    // A list of tag names is not something the user can read.
    expect(isUsableSearchServer({ status: 'ok', accounts: 3, statuses: 0, hashtags: 4 })).toBe(
      false,
    );
  });

  it('does not count an unprobed post search as working', () => {
    expect(
      isUsableSearchServer({ status: 'ok', accounts: 3, statuses: null, hashtags: null }),
    ).toBe(false);
  });
});

describe('isTagsOnly', () => {
  it('is true only when the tag matched and no posts came with it', () => {
    expect(isTagsOnly({ status: 'ok', accounts: 1, statuses: 0, hashtags: 2 })).toBe(true);
    expect(isTagsOnly({ status: 'ok', accounts: 1, statuses: 3, hashtags: 2 })).toBe(false);
    expect(isTagsOnly({ status: 'ok', accounts: 1, statuses: 0, hashtags: 0 })).toBe(false);
    // Never asked, so nothing to conclude.
    expect(isTagsOnly({ status: 'unreachable', accounts: 0, statuses: null, hashtags: null })).toBe(
      false,
    );
  });
});
