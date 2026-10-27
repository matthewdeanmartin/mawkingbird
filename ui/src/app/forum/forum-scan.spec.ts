import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../api';
import { Auth } from '../auth';
import { Account, Context, Status } from '../models';
import { account, post, reply } from '../testing/forum-fixtures';
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
  };
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
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
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
});

describe('source parameters', () => {
  it('round-trips each kind and falls back to Home', () => {
    for (const param of ['home', 'list:42', 'tag:rust']) {
      expect(sourceParam(parseSource(param))).toBe(param);
    }
    expect(parseSource('tag:#Rust')).toEqual({ kind: 'tag', name: 'rust' });
    expect(parseSource(null)).toEqual({ kind: 'home' });
    expect(parseSource('tag:')).toEqual({ kind: 'home' });
    expect(parseSource('nonsense')).toEqual({ kind: 'home' });
  });
});
