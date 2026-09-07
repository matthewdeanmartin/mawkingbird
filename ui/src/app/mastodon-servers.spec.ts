import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MastodonServers } from './mastodon-servers';

const RAW = [
  {
    domain: 'mastodon.social',
    description: 'The   original server.',
    category: 'general',
    total_users: 900_000,
  },
  { domain: 'fosstodon.org', description: 'For FOSS fans.', category: 'tech', total_users: 50_000 },
  { domain: 'tiny.example', description: 'A cozy place.', category: 'general', total_users: 200 },
];

describe('MastodonServers', () => {
  let svc: MastodonServers;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    svc = TestBed.inject(MastodonServers);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchOnce(data: unknown, ok = true): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(data) }));
  }

  function mockDirectoryFetch(live: unknown, bundled: unknown = RAW): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(url.includes('api.joinmastodon.org') ? live : bundled),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('ensureLoaded fetches, trims whitespace, and caches to localStorage', async () => {
    mockFetchOnce(RAW);
    svc.ensureLoaded();
    await vi.waitFor(() => expect(svc.servers().length).toBe(3));

    // Collapsed internal whitespace in the description.
    expect(svc.servers()[0].description).toBe('The original server.');
    expect(localStorage.getItem('mastodon_mock_server_index')).toContain('mastodon.social');
  });

  it('does not re-fetch when a fresh cache is already loaded', async () => {
    mockFetchOnce(RAW);
    svc.ensureLoaded();
    await vi.waitFor(() => expect(svc.servers().length).toBe(3));

    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockClear();
    svc.ensureLoaded();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('search ranks exact/prefix domain matches above description matches, then by size', async () => {
    mockFetchOnce(RAW);
    svc.ensureLoaded();
    await vi.waitFor(() => expect(svc.servers().length).toBe(3));

    const byPrefix = svc.search('foss');
    expect(byPrefix[0].domain).toBe('fosstodon.org');

    // Empty query returns biggest-first.
    const defaults = svc.search('');
    expect(defaults[0].domain).toBe('mastodon.social');
  });

  it('swallows fetch failures and keeps any existing list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    svc.ensureLoaded();
    await vi.waitFor(() => expect(svc.loading()).toBe(false));
    expect(svc.servers()).toEqual([]);
  });

  it('uses the bundled directory when the live API is blocked', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('api.joinmastodon.org')) {
        return Promise.reject(new Error('blocked'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(RAW) });
    });
    vi.stubGlobal('fetch', fetchMock);

    await svc.ensureLoaded();

    expect(svc.servers()).toHaveLength(3);
    expect(svc.source()).toBe('bundled');
  });

  it('returns all unexcluded servers in discovery order', async () => {
    mockDirectoryFetch(RAW);
    await svc.ensureLoaded();

    const candidates = svc.shuffled(new Set(['mastodon.social']));

    expect(candidates.map((server) => server.domain).sort()).toEqual([
      'fosstodon.org',
      'tiny.example',
    ]);
  });

  it('alternates large and small servers during random discovery', async () => {
    mockDirectoryFetch(RAW);
    await svc.ensureLoaded();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const candidates = svc.shuffled();

    expect(candidates.map((server) => server.users >= 10_000)).toEqual([true, false, true]);
  });
});
