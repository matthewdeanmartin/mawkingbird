import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import { encodeBase64 } from './hugo-contents';
import { HugoRepo, HugoSettings } from './hugo-settings';
import { PossePublish } from './posse-publish';
import { PosseQueue } from './posse-queue';

const REPO: HugoRepo = {
  owner: 'mistersql',
  repo: 'my-blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: null,
  includeInProfile: false,
};

const TODAY = new Date('2026-08-06T12:00:00Z');
const DAY_PATH = '/contents/data/interactions/2026-08-06.json';

function status(url: string): Status {
  return {
    id: url,
    url,
    content: '<p>Something worth keeping</p>',
    account: { acct: 'alice@dmv.community' },
    provider: 'mastodon',
  } as Status;
}

function committed(): Response {
  return new Response(
    JSON.stringify({
      content: { path: 'data/interactions/2026-08-06.json', sha: 'blob', html_url: 'https://gh/f' },
      commit: { sha: 'commit-abc' },
    }),
    { status: 200 },
  );
}

function existingFile(records: unknown[], sha = 'old-blob'): Response {
  return new Response(JSON.stringify({ content: encodeBase64(JSON.stringify(records)), sha }), {
    status: 200,
  });
}

function notFound(): Response {
  return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
}

/** Route reads and writes independently, so order does not matter. */
function route(onRead: () => Response, onWrite: () => Response = committed): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith('https://api.github.com/')) {
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      return Promise.resolve(init?.method === 'PUT' ? onWrite() : onRead());
    },
  );
}

function writes(): RequestInit[] {
  return vi
    .mocked(fetch)
    .mock.calls.filter(
      (call) =>
        String(call[0]).startsWith('https://api.github.com/') &&
        (call[1] as RequestInit | undefined)?.method === 'PUT',
    )
    .map((call) => call[1] as RequestInit);
}

interface SentRecord {
  kind: string;
  target: string;
  published: string;
}

function sentRecords(index = 0): SentRecord[] {
  const body = JSON.parse(writes()[index].body as string);
  return JSON.parse(atob(body.content.replace(/\s+/g, ''))) as SentRecord[];
}

function setUp(urls: string[]): { publisher: PossePublish; queue: PosseQueue } {
  TestBed.inject(HugoSettings).connect('tok', REPO);
  const queue = TestBed.inject(PosseQueue);
  for (const url of urls) {
    queue.add('like', status(url));
  }
  return { publisher: TestBed.inject(PossePublish), queue };
}

describe('PossePublish', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('writes the whole batch in one commit', async () => {
    route(notFound);
    const { publisher, queue } = setUp([
      'https://m.social/1',
      'https://m.social/2',
      'https://m.social/3',
    ]);

    const result = await publisher.publishAll(TODAY);

    // The entire point of queueing: three likes, one commit, one rebuild.
    expect(writes()).toHaveLength(1);
    expect(sentRecords()).toHaveLength(3);
    expect(result.publishedIds).toHaveLength(3);
    expect(queue.count()).toBe(0);
  });

  it('files interactions under the day they are published', async () => {
    route(notFound);
    const { publisher } = setUp(['https://m.social/1']);

    const result = await publisher.publishAll(TODAY);

    expect(result.path).toBe('data/interactions/2026-08-06.json');
    expect(
      String(vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes(DAY_PATH))?.[0]),
    ).toContain(DAY_PATH);
  });

  it('creates the day file with no sha, so GitHub decides if it exists', async () => {
    route(notFound);
    const { publisher } = setUp(['https://m.social/1']);

    await publisher.publishAll(TODAY);

    expect(JSON.parse(writes()[0].body as string).sha).toBeUndefined();
  });

  it('merges into an existing day rather than replacing it', async () => {
    route(() =>
      existingFile([
        { kind: 'like', target: 'https://m.social/earlier', published: '2026-08-06T08:00:00Z' },
      ]),
    );
    const { publisher } = setUp(['https://m.social/1']);

    await publisher.publishAll(TODAY);

    const records = sentRecords();
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.target)).toContain('https://m.social/earlier');
    // And it sends the sha back, so a concurrent write is caught.
    expect(JSON.parse(writes()[0].body as string).sha).toBe('old-blob');
  });

  it('does not re-record something already in the day file', async () => {
    route(() =>
      existingFile([
        { kind: 'like', target: 'https://m.social/1', published: '2026-08-06T08:00:00Z' },
      ]),
    );
    const { publisher, queue } = setUp(['https://m.social/1']);

    const result = await publisher.publishAll(TODAY);

    // Nothing to write, so no commit and no pointless rebuild — but it counts
    // as done and leaves the queue.
    expect(writes()).toHaveLength(0);
    expect(result.commitSha).toBe('');
    expect(result.alreadyPresent).toBe(1);
    expect(queue.count()).toBe(0);
  });

  it('re-reads and merges when the day file changed underneath', async () => {
    let attempt = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.startsWith('https://api.github.com/')) {
          return Promise.resolve(new Response('{}', { status: 200 }));
        }
        if (init?.method === 'PUT') {
          attempt++;
          return Promise.resolve(
            attempt === 1
              ? new Response(JSON.stringify({ message: 'Conflict' }), { status: 409 })
              : committed(),
          );
        }
        return Promise.resolve(
          attempt === 0
            ? existingFile([], 'sha-1')
            : existingFile(
                [
                  {
                    kind: 'like',
                    target: 'https://m.social/other',
                    published: '2026-08-06T09:00:00Z',
                  },
                ],
                'sha-2',
              ),
        );
      },
    );
    const { publisher, queue } = setUp(['https://m.social/1']);

    await publisher.publishAll(TODAY);

    // The other writer's record survives — overwriting would have destroyed it.
    expect(JSON.parse(writes()[1].body as string).sha).toBe('sha-2');
    expect(sentRecords(1).map((r) => r.target)).toContain('https://m.social/other');
    expect(queue.count()).toBe(0);
  });

  it('leaves the queue untouched when publishing fails', async () => {
    route(
      notFound,
      () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }),
    );
    const { publisher, queue } = setUp(['https://m.social/1', 'https://m.social/2']);

    await expect(publisher.publishAll(TODAY)).rejects.toThrow(/rejected that token/);

    // Nothing is lost by trying.
    expect(queue.count()).toBe(2);
  });

  it('explains a corrupt day file instead of silently replacing it', async () => {
    route(
      () =>
        new Response(JSON.stringify({ content: encodeBase64('not json'), sha: 's' }), {
          status: 200,
        }),
    );
    const { publisher, queue } = setUp(['https://m.social/1']);

    await expect(publisher.publishAll(TODAY)).rejects.toThrow(/not valid JSON/);

    expect(writes()).toHaveLength(0);
    expect(queue.count()).toBe(1);
  });

  describe('source URLs', () => {
    /** The repo with a site address, which source URLs need. */
    function setUpWithSite(urls: string[]): { publisher: PossePublish; queue: PosseQueue } {
      TestBed.inject(HugoSettings).connect('tok', {
        ...REPO,
        siteUrl: 'https://mistersql.github.io/mistersql/',
      });
      const queue = TestBed.inject(PosseQueue);
      for (const url of urls) {
        queue.add('like', status(url));
      }
      return { publisher: TestBed.inject(PossePublish), queue };
    }

    it('names the page the blog will generate, numbering from 1', async () => {
      route(notFound);
      const { publisher, queue } = setUpWithSite(['https://m.social/1', 'https://m.social/2']);
      const [first, second] = queue.entries();

      const result = await publisher.publishAll(TODAY);

      // Must match content/interactions/_content.gotmpl in the blog repo, which
      // names pages <day>-<n> by position in the committed array.
      expect(result.sourceUrls[first.id]).toBe(
        'https://mistersql.github.io/mistersql/interactions/2026-08-06-1/',
      );
      expect(result.sourceUrls[second.id]).toBe(
        'https://mistersql.github.io/mistersql/interactions/2026-08-06-2/',
      );
    });

    it('numbers by final sorted position, not queue order', async () => {
      // An earlier record already in the file sorts first, so today's entry is
      // page 2 — taking the index before the sort would name the wrong page.
      route(() =>
        existingFile([
          { kind: 'like', target: 'https://m.social/earlier', published: '2026-08-06T01:00:00Z' },
        ]),
      );
      const { publisher, queue } = setUpWithSite(['https://m.social/1']);
      const [entry] = queue.entries();

      const result = await publisher.publishAll(TODAY);

      expect(result.sourceUrls[entry.id]).toContain('2026-08-06-2/');
    });

    it('has no source URL when no site address is configured', async () => {
      route(notFound);
      const { publisher, queue } = setUp(['https://m.social/1']);
      const [entry] = queue.entries();

      const result = await publisher.publishAll(TODAY);

      // A relative source is useless to a receiver, so there is nothing to send.
      expect(result.sourceUrls[entry.id]).toBe('');
    });
  });

  it('refuses to publish an empty queue', async () => {
    TestBed.inject(HugoSettings).connect('tok', REPO);

    await expect(TestBed.inject(PossePublish).publishAll(TODAY)).rejects.toThrow(/Nothing/);
  });
});
