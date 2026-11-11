import { describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { MediaAttachment, Status } from '../../platform/api/models';
import {
  DownloadItem,
  DownloadOptions,
  collectMedia,
  eachLimited,
  fetchMedia,
  filenameFor,
  hasDownloadableMedia,
  zipFiles,
} from './media-download';

function media(over: Partial<MediaAttachment> = {}): MediaAttachment {
  return {
    id: 'm1',
    type: 'image',
    url: 'https://home.test/cache/a.jpg',
    preview_url: 'https://home.test/cache/a-small.jpg',
    description: null,
    ...over,
  };
}

function status(over: Partial<Status> = {}): Status {
  return {
    id: '101',
    created_at: '2026-10-31T12:00:00Z',
    account: { acct: 'ann@origin.test' },
    url: 'https://origin.test/@ann/101',
    sensitive: false,
    spoiler_text: '',
    reblog: null,
    media_attachments: [media()],
    content: '',
    ...over,
  } as Status;
}

const all: DownloadOptions = {
  types: new Set(['image', 'gifv', 'video', 'audio']),
  skipSensitive: false,
  includeBoosts: true,
};

describe('collectMedia', () => {
  it('tries the home copy first, then the origin copy', () => {
    const [item] = collectMedia(
      [status({ media_attachments: [media({ remote_url: 'https://origin.test/a.jpg' })] })],
      all,
    );
    expect(item.candidates).toEqual(['https://home.test/cache/a.jpg', 'https://origin.test/a.jpg']);
    expect(item.filename).toBe('ann_origin_test-2026-10-31-101-1.jpg');
    expect(item.postUrl).toBe('https://origin.test/@ann/101');
  });

  it('filters by type, sensitivity and boosts, and fetches a repeated file once', () => {
    const video = media({ id: 'v', type: 'video', url: 'https://home.test/v.mp4' });
    const plain = status({ media_attachments: [media(), video] });
    const cw = status({
      id: '102',
      spoiler_text: 'spoilers',
      media_attachments: [media({ url: 'https://home.test/cw.jpg' })],
    });
    const boost = status({
      id: '103',
      reblog: status({ id: '104', media_attachments: [media({ url: 'https://home.test/b.jpg' })] }),
    });
    const repeat = status({ id: '105' });

    const urls = (options: DownloadOptions) =>
      collectMedia([plain, cw, boost, repeat], options).map((item) => item.candidates[0]);

    expect(urls(all)).toEqual([
      'https://home.test/cache/a.jpg',
      'https://home.test/v.mp4',
      'https://home.test/cw.jpg',
      'https://home.test/b.jpg',
    ]);
    expect(urls({ ...all, types: new Set(['video']) })).toEqual(['https://home.test/v.mp4']);
    expect(urls({ ...all, skipSensitive: true })).not.toContain('https://home.test/cw.jpg');
    expect(urls({ ...all, includeBoosts: false })).not.toContain('https://home.test/b.jpg');
  });

  it('scrapes pictures from RSS bodies but not link cards from Mastodon posts', () => {
    const body = '<p><img src="https://blog.test/photo.jpg"></p>';
    const card = { url: 'https://news.test', image: 'https://news.test/og.jpg' };
    const rss = status({ provider: 'rss', media_attachments: [], content: body });
    const linkPost = status({ media_attachments: [], card } as unknown as Partial<Status>);
    expect(collectMedia([rss], all).map((item) => item.candidates)).toEqual([
      ['https://blog.test/photo.jpg'],
    ]);
    expect(hasDownloadableMedia(linkPost)).toBe(false);
  });
});

describe('filenameFor', () => {
  it('falls back to an extension for the media type and strips unsafe characters', () => {
    const post = status({ id: 'bsky:at://did:plc:x/app.bsky.feed.post/3k' });
    expect(filenameFor(post, 0, 'https://cdn.test/img/feed_fullsize/plain', 'video')).toBe(
      'ann_origin_test-2026-10-31-bsky_at_did_plc_x_app_bsky_feed_post_3k-1.mp4',
    );
  });
});

describe('fetchMedia', () => {
  const item: DownloadItem = {
    type: 'image',
    candidates: ['https://nocors.test/a.jpg', 'https://cors.test/a.jpg'],
    filename: 'a.jpg',
    postUrl: null,
  };

  it('falls back to the next URL after a CORS refusal and skips that host afterwards', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('https://nocors.test')) throw new TypeError('Failed to fetch');
      return new Response('jpeg', { headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;
    const blocked = new Set<string>();

    const first = await fetchMedia(item, blocked, undefined, fetcher);
    expect(await first!.blob.text()).toBe('jpeg');
    expect(blocked).toEqual(new Set(['nocors.test']));

    await fetchMedia(item, blocked, undefined, fetcher);
    expect(vi.mocked(fetcher).mock.calls.map(([url]) => String(url))).toEqual([
      'https://nocors.test/a.jpg',
      'https://cors.test/a.jpg',
      'https://cors.test/a.jpg',
    ]);
  });

  it('treats an error status as a miss without blocking the host', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    const blocked = new Set<string>();
    expect(await fetchMedia(item, blocked, undefined, fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(blocked.size).toBe(0);
  });

  it('rethrows when cancelled instead of moving on', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch;
    await expect(fetchMedia(item, new Set(), controller.signal, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe('eachLimited', () => {
  it('never runs more than the limit at once and visits every item', async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    await eachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(n);
      running--;
    });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('zipFiles', () => {
  it('stores each file under its name, renaming collisions', async () => {
    const entry = (filename: string, text: string) => ({
      item: { type: 'image' as const, candidates: [], filename, postUrl: null },
      blob: new Blob([text]),
    });
    const zip = await zipFiles([
      entry('a.jpg', 'one'),
      entry('a.jpg', 'two'),
      entry('b.png', 'three'),
    ]);
    expect(zip.type).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    expect(Object.keys(files)).toEqual(['a.jpg', 'a~2.jpg', 'b.png']);
    expect(decode(files['a~2.jpg'])).toBe('two');
  });
});
