import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeServerAvailability } from './server-availability';

describe('probeServerAvailability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports available only after the advertised media URL is reachable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ title: 'Example', thumbnail: 'https://cdn.example/site.png' }),
      })
      .mockResolvedValueOnce({ type: 'opaque' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeServerAvailability('https://example.social')).resolves.toEqual({
      status: 'available',
      title: 'Example',
      mediaUrl: 'https://cdn.example/site.png',
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://cdn.example/site.png',
      expect.objectContaining({ mode: 'no-cors' }),
    );
  });

  it('reports a reachable instance with a blocked CDN as degraded', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ thumbnail: { url: 'https://cdn.masto.host/site.png' } }),
        })
        .mockRejectedValueOnce(new Error('blocked')),
    );

    expect((await probeServerAvailability('https://example.social')).status).toBe('degraded');
  });

  it('checks the v1 contact account CDN when the same-origin thumbnail is reachable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            title: 'Mastodon Uno',
            thumbnail: 'https://mastodon.uno/preview.png',
            contact_account: {
              avatar_static: 'https://cdn.masto.host/mastodonuno/avatar.png',
            },
          }),
      })
      .mockRejectedValueOnce(new Error('CDN blocked'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeServerAvailability('https://mastodon.uno')).resolves.toEqual({
      status: 'degraded',
      title: 'Mastodon Uno',
      mediaUrl: 'https://cdn.masto.host/mastodonuno/avatar.png',
    });
  });
});
