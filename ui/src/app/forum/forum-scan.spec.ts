import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../api';
import { LocalModeration } from '../local-moderation';
import { SearchServer } from '../search-server';
import { Auth } from '../auth';
import { Account, Context, Status } from '../models';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { account, originCopy, post, reply, who } from '../testing/forum-fixtures';
import {
  FIRST_SCAN_CALLS,
  ForumScan,
  MAX_SCAN_CALLS,
  PAGE_SIZE,
  parseSource,
  sourceParam,
} from './forum-scan';

/** A root by `a` answered by `b`: one real discussion per call to it. */
function conversation(n: number): { root: Status; answer: Status } {
  const root = post(`${n}00`, `a${n}`, { replies_count: 1 });
  return { root, answer: reply(`${n}01`, `b${n}`, root) };
}

describe('ForumScan', () => {
  let api: {
    homeTimeline: ReturnType<typeof vi.fn>;
    listTimeline: ReturnType<typeof vi.fn>;
    tagTimeline: ReturnType<typeof vi.fn>;
    getContext: ReturnType<typeof vi.fn>;
    relationships: ReturnType<typeof vi.fn>;
    getAccountStatuses: ReturnType<typeof vi.fn>;
    notifications: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };
  let searchServerActive: boolean;
  let origin: { getContext: ReturnType<typeof vi.fn> };
  let contexts: Map<string, Observable<Context>>;
  let pages: Status[][];

  function scanner(): ForumScan {
    return TestBed.inject(ForumScan);
  }

  async function settled(scan: ForumScan): Promise<void> {
    await vi.waitFor(() => expect(scan.scanning()).toBe(false));
  }

  /** `count` conversations, their roots on the home timeline 40 to a page. */
  function feed(count: number): void {
    const roots: Status[] = [];
    for (let n = 1; n <= count; n++) {
      const { root, answer } = conversation(n);
      roots.push(root);
      contexts.set(root.id, of({ ancestors: [], descendants: [answer] }));
    }
    pages = [];
    for (let i = 0; i < roots.length; i += PAGE_SIZE) pages.push(roots.slice(i, i + PAGE_SIZE));
  }

  beforeEach(() => {
    contexts = new Map();
    pages = [];
    searchServerActive = false;
    api = {
      homeTimeline: vi.fn((maxId?: string) => {
        const index = maxId ? pages.findIndex((page) => page.at(-1)?.id === maxId) + 1 : 0;
        return of(pages[index] ?? []);
      }),
      listTimeline: vi.fn(() => of([])),
      tagTimeline: vi.fn(() => of([])),
      getContext: vi.fn((id: string) => contexts.get(id) ?? of({ ancestors: [], descendants: [] })),
      relationships: vi.fn((ids: string[]) =>
        of(ids.map((id) => ({ id, following: id.startsWith('b') }))),
      ),
      getAccountStatuses: vi.fn(() => of([])),
      search: vi.fn(() => of({ accounts: [], statuses: [], hashtags: [] })),
      notifications: vi.fn(() => of([])),
    };
    origin = { getContext: vi.fn(() => throwError(() => ({ status: 401 }))) };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: AnonymousPublicApi, useValue: origin },
        { provide: SearchServer, useValue: { active: () => searchServerActive } },
        { provide: Auth, useValue: { account: signal<Account | null>(account('me')) } },
      ],
    });
  });

  it('spends the first scan on a page, then the best candidates, within 10 calls', async () => {
    feed(30);
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);

    expect(scan.callsUsed()).toBe(FIRST_SCAN_CALLS);
    expect(api.homeTimeline).toHaveBeenCalledWith(undefined, PAGE_SIZE);
    // One page held enough candidates; one call kept back for follow state.
    expect(api.homeTimeline).toHaveBeenCalledTimes(1);
    expect(api.relationships).toHaveBeenCalledTimes(1);
    expect(scan.summaries()).toHaveLength(FIRST_SCAN_CALLS - 2);
    expect(scan.state()).toBe('spent');
    expect(scan.following().size).toBeGreaterThan(0);
  });

  it('continues with Scan deeper from where it stopped, never repeating work', async () => {
    feed(30);
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    scan.deeper(10);
    await settled(scan);

    expect(scan.callsUsed()).toBe(20);
    const probed = api.getContext.mock.calls.map(([id]) => id);
    expect(new Set(probed).size).toBe(probed.length);
    expect(scan.summaries().length).toBe(probed.length);
  });

  it('stops at the ceiling however much is asked for', async () => {
    feed(120);
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    for (let i = 0; i < 5; i++) {
      scan.deeper(25);
      await settled(scan);
    }
    expect(scan.callsUsed()).toBe(MAX_SCAN_CALLS);
    expect(scan.canGoDeeper()).toBe(false);
  });

  it('reads another page only once the candidates run out', async () => {
    feed(41);
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    scan.deeper(25);
    await settled(scan);
    scan.deeper(25);
    await settled(scan);
    expect(api.homeTimeline.mock.calls.map(([maxId]) => maxId)).toEqual([
      undefined,
      pages[0].at(-1)!.id,
      pages[1].at(-1)!.id,
    ]);
    expect(scan.state()).toBe('exhausted');
    expect(scan.summaries()).toHaveLength(41);
  });

  it('keeps everything found when the reader presses Stop', async () => {
    feed(10);
    contexts.set('500', NEVER as Observable<Context>);
    contexts.set('600', NEVER as Observable<Context>);
    const scan = scanner();
    scan.start({ kind: 'home' });
    await vi.waitFor(() => expect(scan.summaries().length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(api.getContext).toHaveBeenCalledWith('600'));
    const found = scan.summaries().length;
    scan.stop();
    await settled(scan);

    expect(scan.state()).toBe('stopped');
    expect(scan.summaries()).toHaveLength(found);
    expect(scan.canGoDeeper()).toBe(true);
  });

  it('stops on a 429 and keeps what was found', async () => {
    feed(10);
    contexts.set(
      '400',
      throwError(() => ({ status: 429 })),
    );
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);

    expect(scan.state()).toBe('rateLimited');
    expect(scan.summaries().length).toBeGreaterThan(0);
    expect(scan.callsUsed()).toBeLessThan(FIRST_SCAN_CALLS);
  });

  it('skips a probe that fails and carries on', async () => {
    feed(5);
    contexts.set(
      '200',
      throwError(() => ({ status: 404 })),
    );
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    expect(scan.summaries()).toHaveLength(4);
    expect(scan.state()).toBe('exhausted');
  });

  it('reports a feed it could not read', async () => {
    api.homeTimeline.mockReturnValue(throwError(() => ({ status: 500 })));
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    expect(scan.state()).toBe('failed');
  });

  it('walks a reply back to its root and files the thread under it', async () => {
    const root = post('1', 'a', { replies_count: 1 });
    const middle = reply('2', 'b', root);
    const leaf = reply('3', 'c', middle);
    pages = [[leaf]];
    contexts.set('3', of({ ancestors: [root, middle], descendants: [] }));
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);

    const [only] = scan.summaries();
    expect(only.discussion.anchor.id).toBe('1');
    expect(only.discussion.partial).toBe(false);
    expect(only.discussion.treeLoaded).toBe(false);
    expect(only.discussion.posts.map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('marks a discussion partial when the ancestors stop short of a root', async () => {
    const lost = post('1', 'a');
    const middle = reply('2', 'b', lost);
    const leaf = reply('3', 'c', middle);
    pages = [[leaf]];
    contexts.set('3', of({ ancestors: [middle], descendants: [] }));
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    expect(scan.summaries()[0].discussion).toMatchObject({ partial: true, anchor: middle });
  });

  it('merges a partial discussion into the root found above it later', async () => {
    const root = post('1', 'a', { replies_count: 1 });
    const middle = reply('2', 'b', root);
    const leaf = reply('3', 'c', middle);
    const sibling = reply('4', 'd', root);
    pages = [[leaf, sibling]];
    contexts.set('3', of({ ancestors: [middle], descendants: [] }));
    contexts.set('4', of({ ancestors: [root], descendants: [] }));
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);

    expect(scan.found()).toHaveLength(1);
    expect(scan.found()[0].anchor.id).toBe('1');
    expect(scan.found()[0].posts.map((p) => p.id)).toEqual(['1', '2', '3', '4']);
  });

  it('never counts a tweet storm as a discussion', async () => {
    const root = post('1', 'a', { replies_count: 1 });
    const second = reply('2', 'a', root);
    pages = [[root]];
    contexts.set('1', of({ ancestors: [], descendants: [second] }));
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    expect(scan.found()).toHaveLength(1);
    expect(scan.summaries()).toEqual([]);
  });

  it('reads lists and hashtags from their own timelines', async () => {
    const scan = scanner();
    scan.start({ kind: 'list', id: '7' });
    await settled(scan);
    expect(api.listTimeline).toHaveBeenCalledWith('7', undefined, PAGE_SIZE);
    scan.start({ kind: 'tag', name: 'rust' });
    await settled(scan);
    expect(api.tagTimeline).toHaveBeenCalledWith('rust', undefined, PAGE_SIZE);
  });

  it('starting over forgets the previous scan', async () => {
    feed(5);
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    scan.start({ kind: 'tag', name: 'empty' });
    await settled(scan);
    expect(scan.found()).toEqual([]);
    expect(scan.callsUsed()).toBe(1);
  });

  describe('widening on the anchor’s own server', () => {
    const remote = account('a', 'ua@origin.example');
    function remoteRoot(overrides: Partial<Status> = {}): Status {
      return post('1', 'a', {
        account: remote,
        url: 'https://origin.example/@ua/1',
        replies_count: 3,
        ...overrides,
      });
    }

    it('adds the replies only the origin server received, once each', async () => {
      const root = remoteRoot();
      const seen = reply('2', 'b', root);
      const originRoot = originCopy(root);
      pages = [[root]];
      contexts.set('1', of({ ancestors: [], descendants: [seen] }));
      origin.getContext.mockReturnValue(
        of({
          ancestors: [],
          descendants: [
            originCopy(seen, originRoot),
            originCopy(reply('3', 'c', root), originRoot),
          ],
        }),
      );
      const scan = scanner();
      scan.start({ kind: 'home' });
      await settled(scan);

      expect(origin.getContext).toHaveBeenCalledWith(
        expect.objectContaining({ server: 'https://origin.example', id: '1' }),
      );
      const [only] = scan.found();
      expect(only.posts.map((p) => p.id)).toEqual([
        '1',
        '2',
        'anonymous-mastodon:origin.example:3',
      ]);
      expect(only.posts[2].in_reply_to_id).toBe('1');
      expect(only.treeLoaded).toBe(true);
    });

    it('finds the root my server never fetched, above what looked like one', async () => {
      const hidden = post('0', 'z', { account: account('z', 'uz@origin.example') });
      const looksLikeRoot = remoteRoot({ content: '<p>@uz agreed</p>', replies_count: 1 });
      const answer = reply('2', 'b', looksLikeRoot);
      pages = [[looksLikeRoot]];
      contexts.set('1', of({ ancestors: [], descendants: [answer] }));
      origin.getContext.mockReturnValue(of({ ancestors: [originCopy(hidden)], descendants: [] }));
      const scan = scanner();
      scan.start({ kind: 'home' });
      await settled(scan);

      const [only] = scan.found();
      expect(only.anchor.id).toBe('anonymous-mastodon:origin.example:0');
      expect(only.posts).toHaveLength(3);
      expect(scan.discussion(only.anchor.id)).toBe(only);
    });

    it('leaves a discussion as it was when the origin refuses', async () => {
      pages = [[remoteRoot()]];
      contexts.set('1', of({ ancestors: [], descendants: [reply('2', 'b', remoteRoot())] }));
      const scan = scanner();
      scan.start({ kind: 'home' });
      await settled(scan);
      expect(origin.getContext).toHaveBeenCalledTimes(1);
      expect(scan.summaries()).toHaveLength(1);
      expect(scan.state()).toBe('exhausted');
    });

    it('never asks about a thread that started on my own server', async () => {
      feed(3);
      const scan = scanner();
      scan.start({ kind: 'home' });
      await settled(scan);
      expect(origin.getContext).not.toHaveBeenCalled();
    });

    it('gives each server its own budget (owner, 2026-10-27)', async () => {
      const roots = Array.from({ length: 20 }, (_, n) =>
        post(`${n + 1}00`, `a${n}`, {
          account: account(`a${n}`, `ua${n}@origin.example`),
          url: `https://origin.example/@ua${n}/${n + 1}00`,
          replies_count: 4,
        }),
      );
      pages = [roots];
      for (const root of roots) {
        contexts.set(
          root.id,
          of({ ancestors: [], descendants: [reply(`${root.id}1`, 'b', root)] }),
        );
      }
      const scan = scanner();
      scan.start({ kind: 'home' });
      await settled(scan);
      // My server spent its ten; origin.example has its own ten, never more.
      expect(scan.callsUsed()).toBe(10);
      const there = scan.elsewhere().get('origin.example') ?? 0;
      expect(there).toBeGreaterThan(0);
      expect(there).toBeLessThanOrEqual(scan.allowance());
      expect(origin.getContext).toHaveBeenCalledTimes(there);
      expect(scan.elsewhereCalls()).toBe(there);
    });

    it('resolves a root found on another server into my server’s copy', async () => {
      const hidden = post('0', 'z', {
        account: account('z', 'uz@origin.example'),
        url: 'https://origin.example/@uz/0',
      });
      const looksLikeRoot = remoteRoot({ content: '<p>@uz agreed</p>', replies_count: 1 });
      const answer = reply('2', 'b', looksLikeRoot);
      pages = [[looksLikeRoot]];
      contexts.set('1', of({ ancestors: [], descendants: [answer] }));
      origin.getContext.mockReturnValue(of({ ancestors: [originCopy(hidden)], descendants: [] }));
      // My server fetches it over ActivityPub under its own id.
      const mine = { ...hidden, id: '900', in_reply_to_id: null };
      api.search.mockReturnValue(of({ accounts: [], statuses: [mine], hashtags: [] }));
      contexts.set(
        '900',
        of({ ancestors: [], descendants: [{ ...looksLikeRoot, in_reply_to_id: '900' }, answer] }),
      );
      const scan = scanner();
      scan.start({ kind: 'home' });
      await settled(scan);

      expect(api.search).toHaveBeenCalledWith('https://origin.example/@uz/0', 'statuses', {
        resolve: true,
        limit: 1,
      });
      const [only] = scan.found();
      expect(only.anchor.id).toBe('900');
      expect(only.anchor.provider).toBeUndefined();
      expect(only.treeLoaded).toBe(true);
      expect(only.posts.map((p) => p.id)).toEqual(['900', '1', '2']);
    });

    it('keeps the readable foreign copy when my server cannot fetch it', async () => {
      const hidden = post('0', 'z', {
        account: account('z', 'uz@origin.example'),
        url: 'https://origin.example/@uz/0',
      });
      const looksLikeRoot = remoteRoot({ content: '<p>@uz agreed</p>', replies_count: 1 });
      pages = [[looksLikeRoot]];
      contexts.set('1', of({ ancestors: [], descendants: [reply('2', 'b', looksLikeRoot)] }));
      origin.getContext.mockReturnValue(of({ ancestors: [originCopy(hidden)], descendants: [] }));
      const scan = scanner();
      scan.start({ kind: 'home' });
      await settled(scan);
      expect(api.search).toHaveBeenCalledTimes(1);
      expect(scan.found()[0].anchor.id).toBe('anonymous-mastodon:origin.example:0');
    });

    it('does not resolve through a separate search server', async () => {
      searchServerActive = true;
      const hidden = post('0', 'z', {
        account: account('z', 'uz@origin.example'),
        url: 'https://origin.example/@uz/0',
      });
      const looksLikeRoot = remoteRoot({ content: '<p>@uz agreed</p>', replies_count: 1 });
      pages = [[looksLikeRoot]];
      contexts.set('1', of({ ancestors: [], descendants: [reply('2', 'b', looksLikeRoot)] }));
      origin.getContext.mockReturnValue(of({ ancestors: [originCopy(hidden)], descendants: [] }));
      const scan = scanner();
      scan.start({ kind: 'home' });
      await settled(scan);
      expect(api.search).not.toHaveBeenCalled();
    });
  });

  it('reads my posts and my mentions in turn for the Me source', async () => {
    const mine = post('1', 'me', { replies_count: 1 });
    const theirs = post('5', 'x', { replies_count: 0 });
    const mention = reply('6', 'y', theirs, { in_reply_to_account_id: 'me' });
    api.getAccountStatuses.mockReturnValueOnce(of([mine])).mockReturnValue(of([]));
    api.notifications
      .mockReturnValueOnce(of([{ id: 'n1', type: 'mention', status: mention }]))
      .mockReturnValue(of([]));
    contexts.set('1', of({ ancestors: [], descendants: [reply('2', 'b', mine)] }));
    contexts.set('6', of({ ancestors: [theirs], descendants: [] }));
    const scan = scanner();
    scan.start({ kind: 'me' });
    await settled(scan);

    expect(api.getAccountStatuses).toHaveBeenCalledWith('me', {
      excludeReblogs: true,
      maxId: undefined,
      limit: PAGE_SIZE,
    });
    expect(api.notifications).toHaveBeenCalledWith(undefined, {
      types: ['mention'],
      limit: PAGE_SIZE,
    });
    const summaries = scan.summaries();
    expect(summaries.filter((s) => s.iStarted)).toHaveLength(1);
    expect(summaries.filter((s) => s.iJoined)).toHaveLength(0);
    expect(summaries).toHaveLength(2);
  });

  it('leaves out people muted or blocked here, and what they started', async () => {
    localStorage.clear();
    feed(2);
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    expect(scan.summaries()).toHaveLength(2);
    const moderation = TestBed.inject(LocalModeration);
    moderation.block(account('a1'));
    moderation.mute(account('b2'), null);
    expect(scan.summaries()).toEqual([]);
    moderation.clear(account('b2'));
    expect(scan.summaries().map((s) => s.discussion.anchor.account.id)).toEqual(['a2']);
    moderation.clear(account('a1'));
  });

  it('tracks follows by person, so a friend counts on any server', async () => {
    feed(2);
    const scan = scanner();
    scan.start({ kind: 'home' });
    await settled(scan);
    expect([...scan.following()]).toEqual(expect.arrayContaining([who('b1'), who('b2')]));
  });
});

describe('source parameters', () => {
  it('round-trips each kind and falls back to Home', () => {
    for (const param of ['home', 'me', 'list:42', 'tag:rust']) {
      expect(sourceParam(parseSource(param))).toBe(param);
    }
    expect(parseSource('tag:#Rust')).toEqual({ kind: 'tag', name: 'rust' });
    expect(parseSource(null)).toEqual({ kind: 'home' });
    expect(parseSource('tag:')).toEqual({ kind: 'home' });
    expect(parseSource('nonsense')).toEqual({ kind: 'home' });
  });
});
