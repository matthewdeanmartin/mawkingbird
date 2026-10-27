import { computed, inject, Injectable, signal } from '@angular/core';
import { defaultIfEmpty, firstValueFrom, map, Observable, Subject, takeUntil } from 'rxjs';
import { Api } from '../api';
import { Auth } from '../auth';
import { Context, Relationship, Status } from '../models';
import {
  Candidate,
  Discussion,
  discussionKey,
  DiscussionSummary,
  findCandidates,
  isDiscussion,
  mergePosts,
  summarize,
  unwrap,
} from './discussion';

/** Where a scan starts looking. Me (own posts and mentions) arrives in sprint 2. */
export type ForumSource =
  { kind: 'home' } | { kind: 'list'; id: string } | { kind: 'tag'; name: string };

/** `?source=` ⇄ source: `home`, `list:<id>`, `tag:<name>`. Anything else is Home. */
export function parseSource(param: string | null | undefined): ForumSource {
  const [kind, ...rest] = (param ?? '').split(':');
  const value = rest.join(':').trim();
  if (kind === 'list' && value) return { kind: 'list', id: value };
  if (kind === 'tag' && value) return { kind: 'tag', name: value.replace(/^#/, '').toLowerCase() };
  return { kind: 'home' };
}

export function sourceParam(source: ForumSource): string {
  switch (source.kind) {
    case 'home':
      return 'home';
    case 'list':
      return `list:${source.id}`;
    case 'tag':
      return `tag:${source.name}`;
  }
}

/** The first scan's allowance: about 5–10 calls (owner, 2026-10-27). */
export const FIRST_SCAN_CALLS = 10;
/** Hard ceiling per scan (owner, 2026-10-27: "even that seems like a lot"). */
export const MAX_SCAN_CALLS = 50;
/** What Scan deeper offers, each capped by the ceiling. */
export const DEEPER_STEPS: readonly number[] = [10, 25];
/** Mastodon's timeline cap: a call buys the most posts at 40. */
export const PAGE_SIZE = 40;
/** Requests in flight at once. */
export const IN_FLIGHT = 3;
/** Mastodon caps `/accounts/relationships` at 40 ids (see follow-state.ts). */
const RELATIONSHIP_BATCH = 40;

export type ScanState =
  /** Nothing asked yet. */
  | 'idle'
  | 'scanning'
  /** The reader pressed Stop; what was found stays. */
  | 'stopped'
  /** The allowance is spent. Scan deeper may continue. */
  | 'spent'
  /** The source has no more posts and no candidates are left. */
  | 'exhausted'
  /** The server said 429; what was found stays. */
  | 'rateLimited'
  /** Not even the first page could be read. */
  | 'failed';

const STOPPED = Symbol('stopped');

/**
 * One budgeted scan for Forum: sample a feed, then spend calls growing the
 * most promising fragments into whole discussions. See spec/forum.md, "The
 * scan".
 *
 * Every request goes through {@link call}, which counts it before it is sent,
 * so `callsUsed` can never pass `allowance`. Stop cancels requests in flight
 * and keeps everything found; so does a 429. Results are published as each
 * request lands, so an impatient reader always has something.
 *
 * Session only: the service lives for the tab, nothing is stored.
 */
@Injectable({ providedIn: 'root' })
export class ForumScan {
  private api = inject(Api);
  private auth = inject(Auth);

  readonly source = signal<ForumSource | null>(null);
  readonly state = signal<ScanState>('idle');
  readonly callsUsed = signal(0);
  readonly allowance = signal(0);
  readonly postsSampled = signal(0);
  /** Everything found, qualifying or not; the list reads {@link summaries}. */
  readonly found = signal<readonly Discussion[]>([]);
  /** Accounts the viewer follows, among the participants asked about. */
  readonly following = signal<ReadonlySet<string>>(new Set());

  /** Discussions only: two posts, two people. */
  readonly summaries = computed<DiscussionSummary[]>(() => {
    const me = this.auth.account()?.id ?? null;
    const following = this.following();
    return this.found()
      .filter(isDiscussion)
      .map((discussion) => summarize(discussion, me, following));
  });

  readonly scanning = computed(() => this.state() === 'scanning');
  /** Calls Scan deeper may still spend. */
  readonly headroom = computed(() => MAX_SCAN_CALLS - this.callsUsed());
  readonly canGoDeeper = computed(
    () =>
      this.source() !== null &&
      !this.scanning() &&
      this.headroom() > 0 &&
      this.state() !== 'exhausted' &&
      this.state() !== 'failed',
  );

  private sample: Status[] = [];
  private maxId: string | undefined;
  private exhausted = false;
  private pagesThisStep = 0;
  private probed = new Set<string>();
  /** Post id → the key of the discussion that holds it. */
  private owner = new Map<string, string>();
  private asked = new Set<string>();
  private stop$ = new Subject<void>();
  private stopped = false;
  private generation = 0;

  /** Start over on a source, with the first scan's allowance. */
  start(source: ForumSource): void {
    this.stop$.next();
    this.generation++;
    this.source.set(source);
    this.found.set([]);
    this.following.set(new Set());
    this.callsUsed.set(0);
    this.postsSampled.set(0);
    this.sample = [];
    this.maxId = undefined;
    this.exhausted = false;
    this.probed.clear();
    this.owner.clear();
    this.asked.clear();
    this.allowance.set(FIRST_SCAN_CALLS);
    void this.run(this.generation);
  }

  /** Spend up to `calls` more, continuing where the last step stopped. */
  deeper(calls: number): void {
    if (!this.canGoDeeper()) return;
    this.allowance.set(Math.min(MAX_SCAN_CALLS, this.callsUsed() + calls));
    void this.run(this.generation);
  }

  /** Cancel what is in flight; keep what was found. */
  stop(): void {
    if (!this.scanning()) return;
    this.stopped = true;
    this.stop$.next();
    this.state.set('stopped');
  }

  private remaining(): number {
    return this.allowance() - this.callsUsed();
  }

  private async run(generation: number): Promise<void> {
    this.stopped = false;
    this.pagesThisStep = 0;
    this.state.set('scanning');
    const live = () => generation === this.generation && !this.stopped;
    try {
      while (live()) {
        const unknown = this.unknownPeople();
        const reserve = unknown.length ? 1 : 0;
        const candidates = this.candidates();
        const room = this.remaining() - reserve;

        if (room <= 0) {
          if (reserve && this.remaining() > 0) await this.relationships(unknown);
          if (live()) this.state.set('spent');
          return;
        }
        if (this.wantsPage(candidates.length, room)) {
          const more = await this.page();
          if (more === 'failed' && !this.sample.length) {
            if (live()) this.state.set('failed');
            return;
          }
          continue;
        }
        if (!candidates.length) {
          if (reserve) await this.relationships(unknown);
          if (live()) this.state.set('exhausted');
          return;
        }
        await Promise.all(
          candidates.slice(0, Math.min(IN_FLIGHT, room)).map((candidate) => this.probe(candidate)),
        );
      }
    } catch (error) {
      if (generation !== this.generation) return;
      if ((error as { status?: number })?.status === 429) {
        this.stopped = true;
        this.stop$.next();
        this.state.set('rateLimited');
        return;
      }
      // Requests fail quietly one by one; anything reaching here is a bug, and
      // it must not leave the page spinning or throw away what was found.
      console.error('Forum scan failed', error);
      this.stopped = true;
      this.stop$.next();
      this.state.set(this.found().length ? 'stopped' : 'failed');
    }
  }

  /**
   * Read another page when there is nothing to probe, or too little to fill
   * this step, but never more than two pages a step: probing is where
   * discussions come from.
   */
  private wantsPage(candidates: number, room: number): boolean {
    if (this.exhausted) return false;
    if (!candidates) return true;
    return this.pagesThisStep < 2 && candidates < room - 1;
  }

  private candidates(): Candidate[] {
    return findCandidates(
      this.sample,
      this.auth.account()?.id ?? null,
      new Set([...this.probed, ...this.owner.keys()]),
    );
  }

  /** A metered request: counted on dispatch, cancelled by Stop. */
  private call<T>(request: Observable<T>): Promise<T | typeof STOPPED> {
    this.callsUsed.update((used) => used + 1);
    return firstValueFrom(
      request.pipe(
        takeUntil(this.stop$),
        map((value): T | typeof STOPPED => value),
        defaultIfEmpty(STOPPED as T | typeof STOPPED),
      ),
    );
  }

  private timeline(maxId: string | undefined): Observable<Status[]> {
    const source = this.source() ?? { kind: 'home' };
    switch (source.kind) {
      case 'home':
        return this.api.homeTimeline(maxId, PAGE_SIZE);
      case 'list':
        return this.api.listTimeline(source.id, maxId, PAGE_SIZE);
      case 'tag':
        return this.api.tagTimeline(source.name, maxId, PAGE_SIZE);
    }
  }

  private async page(): Promise<'ok' | 'failed'> {
    this.pagesThisStep++;
    let page: Status[] | typeof STOPPED;
    try {
      page = await this.call(this.timeline(this.maxId));
    } catch (error) {
      if ((error as { status?: number })?.status === 429) throw error;
      this.exhausted = true;
      return 'failed';
    }
    if (page === STOPPED) return 'ok';
    const last = page.at(-1)?.id;
    if (!last || last === this.maxId) {
      this.exhausted = true;
    } else {
      this.maxId = last;
    }
    this.sample = [...this.sample, ...page];
    this.postsSampled.set(this.sample.length);
    return 'ok';
  }

  private async probe(candidate: Candidate): Promise<void> {
    this.probed.add(candidate.probe.id);
    let context: Context | typeof STOPPED;
    try {
      context = await this.call(this.api.getContext(candidate.probe.id));
    } catch (error) {
      if ((error as { status?: number })?.status === 429) throw error;
      return;
    }
    if (context === STOPPED) return;
    this.absorb(candidate, context);
  }

  /**
   * File a probe's context under its root, joining every discussion it
   * touches: one sharing a post, one whose missing parent it holds, or one
   * holding its own missing parent. The joined thread is anchored at its
   * top-most post, so a root found later swallows the partial threads below it.
   */
  private absorb(candidate: Candidate, context: Context): void {
    const byKey = new Map(this.found().map((discussion) => [discussion.key, discussion]));
    let posts = [
      ...context.ancestors,
      candidate.probe,
      ...context.descendants,
      ...candidate.members,
    ].map(unwrap);
    const joined: Discussion[] = [];
    for (let grew = true; grew;) {
      grew = false;
      const ids = new Set(posts.map((post) => post.id));
      const top = topOf(posts);
      for (const discussion of byKey.values()) {
        if (joined.includes(discussion)) continue;
        const parent = discussion.anchor.in_reply_to_id;
        if (
          discussion.posts.some((post) => ids.has(post.id)) ||
          (parent !== null && ids.has(parent)) ||
          (top.in_reply_to_id !== null &&
            discussion.posts.some((post) => post.id === top.in_reply_to_id))
        ) {
          joined.push(discussion);
          posts = [...posts, ...discussion.posts];
          grew = true;
        }
      }
    }
    for (const discussion of joined) byKey.delete(discussion.key);

    const anchor = topOf(posts);
    const key = discussionKey(anchor);
    const discussion = mergePosts(
      { key, anchor, partial: !!anchor.in_reply_to_id, posts: [anchor], treeLoaded: false },
      posts,
    );
    // Only the anchor's own context brings in every branch under it.
    const treeLoaded =
      anchor.id === candidate.probe.id ||
      joined.some((earlier) => earlier.treeLoaded && earlier.anchor.id === anchor.id);
    byKey.set(key, { ...discussion, treeLoaded });
    for (const post of discussion.posts) this.owner.set(post.id, key);
    this.found.set([...byKey.values()]);
  }

  /** Participants of real discussions whose follow state was never asked, starters first. */
  private unknownPeople(): string[] {
    const starters: string[] = [];
    const others: string[] = [];
    for (const discussion of this.found()) {
      if (!isDiscussion(discussion)) continue;
      for (const post of discussion.posts) {
        const id = post.account.id;
        if (this.asked.has(id) || starters.includes(id) || others.includes(id)) continue;
        (post.id === discussion.anchor.id ? starters : others).push(id);
      }
    }
    const me = this.auth.account()?.id;
    return [...starters, ...others].filter((id) => id !== me);
  }

  private async relationships(ids: string[]): Promise<void> {
    const batch = ids.slice(0, RELATIONSHIP_BATCH);
    for (const id of batch) this.asked.add(id);
    let answers: Relationship[] | typeof STOPPED;
    try {
      answers = await this.call(this.api.relationships(batch));
    } catch (error) {
      if ((error as { status?: number })?.status === 429) throw error;
      return;
    }
    if (answers === STOPPED) return;
    const following = new Set(this.following());
    for (const answer of answers) if (answer.following) following.add(answer.id);
    this.following.set(following);
  }
}

/** The post nothing else in the set replies to: the root, or the furthest reached. */
function topOf(posts: readonly Status[]): Status {
  const ids = new Set(posts.map((post) => post.id));
  const tops = posts.filter((post) => !post.in_reply_to_id || !ids.has(post.in_reply_to_id));
  return tops.reduce((best, post) =>
    Number(!post.in_reply_to_id) - Number(!best.in_reply_to_id) > 0 ||
    (!post.in_reply_to_id === !best.in_reply_to_id && post.created_at < best.created_at)
      ? post
      : best,
  );
}
