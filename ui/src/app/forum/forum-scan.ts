import { computed, inject, Injectable, signal } from '@angular/core';
import { defaultIfEmpty, firstValueFrom, map, Observable, Subject, takeUntil } from 'rxjs';
import { Api } from '../api';
import { Auth } from '../auth';
import { LocalModeration } from '../local-moderation';
import { SearchServer } from '../search-server';
import { Context, Relationship, SearchResults, Status } from '../models';
import { adaptAnonymousStatus } from '../providers/anonymous/anonymous-mastodon-provider';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { AnonymousPublicRef } from '../providers/anonymous/anonymous-route-ref';
import { radioPostRef as mastodonPostRef } from '../radio-links';
import {
  Candidate,
  combine,
  Discussion,
  discussionKey,
  DiscussionSummary,
  findCandidates,
  isDiscussion,
  isForeignCopy,
  personKey,
  summarize,
} from './discussion';
import { plainText } from './question';

/**
 * Where a scan starts looking. Me is my own posts plus the mentions of me:
 * the cheap way to fill Mine and Joined, which a Home sample mostly misses.
 */
export type ForumSource =
  { kind: 'home' } | { kind: 'me' } | { kind: 'list'; id: string } | { kind: 'tag'; name: string };

/** `?source=` ⇄ source: `home`, `me`, `list:<id>`, `tag:<name>`. Anything else is Home. */
export function parseSource(param: string | null | undefined): ForumSource {
  const [kind, ...rest] = (param ?? '').split(':');
  const value = rest.join(':').trim();
  if (kind === 'me') return { kind: 'me' };
  if (kind === 'list' && value) return { kind: 'list', id: value };
  if (kind === 'tag' && value) return { kind: 'tag', name: value.replace(/^#/, '').toLowerCase() };
  return { kind: 'home' };
}

export function sourceParam(source: ForumSource): string {
  switch (source.kind) {
    case 'home':
      return 'home';
    case 'me':
      return 'me';
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
  /** The source has no more posts and nothing is left to probe or widen. */
  | 'exhausted'
  /** The server said 429; what was found stays. */
  | 'rateLimited'
  /** Not even the first page could be read. */
  | 'failed';

const STOPPED = Symbol('stopped');

/** One page of a source, and where the next one starts (absent at the end). */
interface Page {
  posts: Status[];
  cursor: string | undefined;
}

/** A pageable stream: a timeline, my posts, or my mentions. */
interface Pager {
  fetch: (maxId: string | undefined) => Observable<Page>;
  maxId: string | undefined;
  done: boolean;
}

function pager(fetch: (maxId: string | undefined) => Observable<Page>): Pager {
  return { fetch, maxId: undefined, done: false };
}

function statusPage(posts: Status[]): Page {
  return { posts, cursor: posts.at(-1)?.id };
}

/**
 * Where to ask for a post's own server's view of its thread, or null when
 * that server is mine (my server's view is what the scan already has).
 */
export function originRef(post: Status): AnonymousPublicRef | null {
  if (isForeignCopy(post)) {
    const ref = post.providerRef as { server?: string; statusId?: string } | undefined;
    return ref?.server && ref.statusId ? { server: ref.server, id: ref.statusId } : null;
  }
  if (!post.account.acct.includes('@')) return null;
  return mastodonPostRef(post.url);
}

function hostOf(server: string): string {
  try {
    return new URL(server).host;
  } catch {
    return server;
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

interface Person {
  id: string;
  person: string;
}

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
 * Calls go to four kinds of work, in waves of up to {@link IN_FLIGHT}:
 * reading pages of the source, probing candidates (my server's context of a
 * sampled post), widening discussions (the anchor's own server's context,
 * which finds roots my server never fetched and replies it never received),
 * and resolving what widening found (ActivityPub: my server fetches the post
 * and returns its own copy, which can be replied to, followed and listed).
 *
 * Every server has its own budget (owner, 2026-10-27): `allowance` calls to
 * mine, and as many again to each other server asked. Spending on
 * mastodon.social does not use up what is left for my server.
 *
 * Session only: the service lives for the tab, nothing is stored.
 */
@Injectable({ providedIn: 'root' })
export class ForumScan {
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymousPublic = inject(AnonymousPublicApi);
  private moderation = inject(LocalModeration);
  private searchServer = inject(SearchServer);

  readonly source = signal<ForumSource | null>(null);
  readonly state = signal<ScanState>('idle');
  /** Calls to my server. */
  readonly callsUsed = signal(0);
  /** The per-server budget: my server's, and each other server's. */
  readonly allowance = signal(0);
  /** Calls to other servers, by host. */
  readonly elsewhere = signal<ReadonlyMap<string, number>>(new Map());
  readonly elsewhereCalls = computed(() =>
    [...this.elsewhere().values()].reduce((total, used) => total + used, 0),
  );
  readonly postsSampled = signal(0);
  /** Everything found, qualifying or not; the list reads {@link summaries}. */
  readonly found = signal<readonly Discussion[]>([]);
  /** {@link personKey}s of participants the viewer follows, among those asked about. */
  readonly following = signal<ReadonlySet<string>>(new Set());

  /**
   * Discussions only: two posts, two people. People muted or blocked here
   * are left out (posts read from other servers were never filtered by mine),
   * and a discussion they started is dropped, as MIMB drops muted starters.
   */
  readonly summaries = computed<DiscussionSummary[]>(() => {
    const account = this.auth.account();
    const me = account ? personKey(account) : null;
    const following = this.following();
    this.moderation.entries();
    const hidden = (post: Status) => this.moderation.isSuppressed(post.account);
    return this.found()
      .filter((discussion) => !hidden(discussion.anchor))
      .map((discussion) =>
        discussion.posts.some(hidden)
          ? { ...discussion, posts: discussion.posts.filter((post) => !hidden(post)) }
          : discussion,
      )
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

  /** Where the list was left (its query and scroll), so Back from a discussion returns there. */
  listParams: Record<string, string[]> = {};
  listScroll = 0;

  private sample: Status[] = [];
  private pagers: Pager[] = [];
  private nextPager = 0;
  private pagesThisStep = 0;
  private probed = new Set<string>();
  /** Discussion keys whose anchor's own server was asked. */
  private widened = new Set<string>();
  /** Discussion keys whose foreign anchor my server was asked to resolve. */
  private resolved = new Set<string>();
  private asked = new Set<string>();
  private stop$ = new Subject<void>();
  private stopped = false;
  private generation = 0;

  /** The discussion anchored at this post id, if the scan found one. */
  discussion(anchorId: string): Discussion | null {
    return this.found().find((discussion) => discussion.anchor.id === anchorId) ?? null;
  }

  /** The discussion holding this post anywhere in it: a reply opened on its own. */
  containing(postId: string): Discussion | null {
    return (
      this.discussion(postId) ??
      this.found().find((discussion) => discussion.posts.some((post) => post.id === postId)) ??
      null
    );
  }

  /** Start over on a source, with the first scan's allowance. */
  start(source: ForumSource): void {
    this.stop$.next();
    this.generation++;
    this.source.set(source);
    this.found.set([]);
    this.following.set(new Set());
    this.callsUsed.set(0);
    this.elsewhere.set(new Map());
    this.postsSampled.set(0);
    this.sample = [];
    this.pagers = this.pagersFor(source);
    this.nextPager = 0;
    this.probed.clear();
    this.widened.clear();
    this.resolved.clear();
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

  private exhausted(): boolean {
    return this.pagers.every((each) => each.done);
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
        // Resolving costs two calls to my server; widening, one to another.
        const resolvable = room >= 2 ? this.resolvable() : [];
        const widenable = this.widenable();
        /** Each completion and what it costs at my server. */
        const completions = [
          ...resolvable.map((discussion) => ({ mine: 2, run: () => this.resolve(discussion) })),
          ...widenable.map((discussion) => ({ mine: 0, run: () => this.widen(discussion) })),
        ];

        if (room <= 0) {
          // My server's budget is spent; other servers may still have theirs.
          if (widenable.length) {
            await Promise.all(widenable.slice(0, IN_FLIGHT).map((each) => this.widen(each)));
            continue;
          }
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
        if (!candidates.length && !completions.length) {
          if (reserve) await this.relationships(unknown);
          if (live()) this.state.set('exhausted');
          return;
        }
        // Completing a discussion already on screen is worth one slot a wave
        // (resolving first: it makes posts actionable); the rest go to finding
        // new ones, until there are none left to find.
        const wave = Math.min(IN_FLIGHT, room);
        let mine = 0;
        const complete: (typeof completions)[number][] = [];
        for (const task of completions) {
          if (complete.length >= (candidates.length ? 1 : IN_FLIGHT)) break;
          if (mine + task.mine > room) continue;
          complete.push(task);
          mine += task.mine;
        }
        const probes = Math.max(0, Math.min(wave - complete.length, room - mine));
        await Promise.all([
          ...complete.map((task) => task.run()),
          ...candidates.slice(0, probes).map((candidate) => this.probe(candidate)),
        ]);
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
    if (this.exhausted()) return false;
    if (!candidates) return true;
    return this.pagesThisStep < 2 && candidates < room - 1;
  }

  private candidates(): Candidate[] {
    const known = new Set(this.probed);
    for (const discussion of this.found()) {
      for (const post of discussion.posts) known.add(post.id);
    }
    return findCandidates(this.sample, this.auth.account()?.id ?? null, known);
  }

  /**
   * Discussions worth asking the anchor's own server about, most needy first:
   * a known gap above the anchor, then the shortfall between the replies the
   * anchor reports and the ones seen, then anchors that read like replies
   * (my server shows a reply whose parent it never fetched as a root).
   */
  private widenable(): Discussion[] {
    const needs = (discussion: Discussion): number => {
      const direct = discussion.posts.filter(
        (post) => post.in_reply_to_id === discussion.anchor.id,
      ).length;
      const shortfall = Math.max(0, discussion.anchor.replies_count - direct);
      const replyLike = plainText(discussion.anchor.content).trimStart().startsWith('@');
      return (discussion.partial ? 1000 : 0) + shortfall * 10 + (replyLike ? 5 : 0);
    };
    return this.found()
      .filter((discussion) => !this.widened.has(discussion.key))
      .filter((discussion) => {
        const ref = originRef(discussion.anchor);
        return ref !== null && this.roomAt(hostOf(ref.server)) > 0;
      })
      .map((discussion) => ({ discussion, need: needs(discussion) }))
      .filter(({ need }) => need > 0)
      .sort((left, right) => right.need - left.need)
      .map(({ discussion }) => discussion);
  }

  /**
   * Discussions whose anchor is a copy read from another server, which my
   * server has not been asked to resolve. Not with a separate search server
   * configured: resolving is my server's own ActivityPub fetch, and search
   * would go elsewhere (as in ThreadLoader).
   */
  private resolvable(): Discussion[] {
    if (this.searchServer.active() || this.auth.lacksMastodonToken) return [];
    return this.found().filter(
      (discussion) =>
        isForeignCopy(discussion.anchor) &&
        !!discussion.anchor.url &&
        !this.resolved.has(discussion.key),
    );
  }

  /** Calls left at another server, under the same per-server allowance. */
  private roomAt(host: string): number {
    return this.allowance() - (this.elsewhere().get(host) ?? 0);
  }

  /**
   * A metered request: counted on dispatch against its server's budget (mine
   * unless `host` names another), cancelled by Stop.
   */
  private call<T>(request: Observable<T>, host?: string): Promise<T | typeof STOPPED> {
    if (host) {
      const elsewhere = new Map(this.elsewhere());
      elsewhere.set(host, (elsewhere.get(host) ?? 0) + 1);
      this.elsewhere.set(elsewhere);
    } else {
      this.callsUsed.update((used) => used + 1);
    }
    return firstValueFrom(
      request.pipe(
        takeUntil(this.stop$),
        map((value): T | typeof STOPPED => value),
        defaultIfEmpty(STOPPED as T | typeof STOPPED),
      ),
    );
  }

  private pagersFor(source: ForumSource): Pager[] {
    switch (source.kind) {
      case 'home':
        return [pager((maxId) => this.api.homeTimeline(maxId, PAGE_SIZE).pipe(map(statusPage)))];
      case 'list':
        return [
          pager((maxId) =>
            this.api.listTimeline(source.id, maxId, PAGE_SIZE).pipe(map(statusPage)),
          ),
        ];
      case 'tag':
        return [
          pager((maxId) =>
            this.api.tagTimeline(source.name, maxId, PAGE_SIZE).pipe(map(statusPage)),
          ),
        ];
      case 'me': {
        const me = () => this.auth.account()?.id ?? '';
        return [
          pager((maxId) =>
            this.api
              .getAccountStatuses(me(), { excludeReblogs: true, maxId, limit: PAGE_SIZE })
              .pipe(map(statusPage)),
          ),
          pager((maxId) =>
            this.api.notifications(maxId, { types: ['mention'], limit: PAGE_SIZE }).pipe(
              map((notifications) => ({
                posts: notifications.flatMap((notification) =>
                  notification.type === 'mention' && notification.status
                    ? [notification.status]
                    : [],
                ),
                cursor: notifications.at(-1)?.id,
              })),
            ),
          ),
        ];
      }
    }
  }

  /** The next page, taking turns between a source's streams. */
  private async page(): Promise<'ok' | 'failed'> {
    this.pagesThisStep++;
    const open = this.pagers.filter((each) => !each.done);
    const current = open[this.nextPager++ % open.length];
    let page: Page | typeof STOPPED;
    try {
      page = await this.call(current.fetch(current.maxId));
    } catch (error) {
      if ((error as { status?: number })?.status === 429) throw error;
      current.done = true;
      return 'failed';
    }
    if (page === STOPPED) return 'ok';
    if (!page.posts.length || !page.cursor || page.cursor === current.maxId) {
      current.done = true;
    } else {
      current.maxId = page.cursor;
    }
    this.sample = [...this.sample, ...page.posts];
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
    this.absorb(
      [...context.ancestors, candidate.probe, ...context.descendants, ...candidate.members],
      discussionKey(candidate.probe),
    );
  }

  /**
   * Ask the anchor's own server for its view of the thread: unauthenticated,
   * public posts only. Replies are delivered to the author's server, so it
   * usually holds replies mine never saw, and the parent mine never fetched.
   * A refusal (signed fetch, timeout) just leaves the discussion as it was.
   */
  private async widen(discussion: Discussion): Promise<void> {
    this.widened.add(discussion.key);
    const ref = originRef(discussion.anchor);
    if (!ref) return;
    let context: Context | typeof STOPPED;
    try {
      context = await this.call(this.anonymousPublic.getContext(ref), hostOf(ref.server));
    } catch (error) {
      if ((error as { status?: number })?.status === 429) throw error;
      return;
    }
    if (context === STOPPED) return;
    // A context leaves out the post it was asked about, yet the origin's
    // replies point at that server's id for it. Its copy, built the way the
    // origin's own posts were, lets combine() tie them to the anchor we hold.
    const anchorThere = isForeignCopy(discussion.anchor)
      ? discussion.anchor
      : {
          ...adaptAnonymousStatus({ ...discussion.anchor, id: ref.id }, ref.server),
          in_reply_to_id: context.ancestors.at(-1)?.id ?? null,
        };
    this.absorb(
      [...context.ancestors, anchorThere, ...discussion.posts, ...context.descendants],
      discussion.key,
    );
  }

  /**
   * Ask my server for its own copy of a foreign anchor (`search` with
   * `resolve`, an ActivityPub fetch under my identity), then for that copy's
   * context. The result has my server's ids, so it can be replied to, liked,
   * followed and listed, and it includes followers-only replies a public read
   * of the origin never shows. combine() keeps my copy over the foreign one.
   * If my server cannot fetch it, the readable foreign copy stays.
   */
  private async resolve(discussion: Discussion): Promise<void> {
    this.resolved.add(discussion.key);
    let results: SearchResults | typeof STOPPED;
    try {
      results = await this.call(
        this.api.search(discussion.anchor.url!, 'statuses', { resolve: true, limit: 1 }),
      );
    } catch (error) {
      if ((error as { status?: number })?.status === 429) throw error;
      return;
    }
    if (results === STOPPED) return;
    const local = results.statuses.find((each) => discussionKey(each) === discussion.key);
    if (!local) return;
    let context: Context | typeof STOPPED;
    try {
      context = await this.call(this.api.getContext(local.id));
    } catch (error) {
      if ((error as { status?: number })?.status === 429) throw error;
      this.absorb([local, ...discussion.posts], discussion.key);
      return;
    }
    if (context === STOPPED) return;
    this.absorb(
      [...context.ancestors, local, ...context.descendants, ...discussion.posts],
      discussionKey(local),
    );
  }

  /**
   * File posts under their root, joining every discussion they touch: one
   * sharing a post, one whose missing parent they hold, or one holding their
   * own missing parent. The result is anchored at its top-most post, so a root
   * found later swallows the partial threads below it.
   *
   * `subtreeOf` is the key of the post whose whole context was just fetched;
   * when that post turns out to be the anchor, every branch is in.
   */
  private absorb(incoming: readonly Status[], subtreeOf: string): void {
    const byKey = new Map(this.found().map((discussion) => [discussion.key, discussion]));
    let posts = combine(incoming);
    const joined: Discussion[] = [];
    for (let grew = true; grew;) {
      grew = false;
      const keys = new Set(posts.map(discussionKey));
      const ids = new Set(posts.map((post) => post.id));
      const top = topOf(posts);
      for (const discussion of byKey.values()) {
        if (joined.includes(discussion)) continue;
        const parent = discussion.anchor.in_reply_to_id;
        if (
          discussion.posts.some((post) => keys.has(discussionKey(post))) ||
          (parent !== null && ids.has(parent)) ||
          (top.in_reply_to_id !== null &&
            discussion.posts.some((post) => post.id === top.in_reply_to_id))
        ) {
          joined.push(discussion);
          posts = combine([...posts, ...discussion.posts]);
          grew = true;
        }
      }
    }
    for (const discussion of joined) byKey.delete(discussion.key);

    const anchor = topOf(posts);
    const key = discussionKey(anchor);
    const treeLoaded =
      subtreeOf === key || joined.some((earlier) => earlier.treeLoaded && earlier.key === key);
    if (joined.some((earlier) => this.widened.has(earlier.key) && earlier.key === key)) {
      this.widened.add(key);
    }
    byKey.set(key, { key, anchor, partial: !!anchor.in_reply_to_id, posts, treeLoaded });
    this.found.set([...byKey.values()]);
  }

  /**
   * Participants of real discussions whose follow state was never asked,
   * starters first. Only my server's account records: an origin server's
   * account ids mean nothing to mine.
   */
  private unknownPeople(): Person[] {
    const me = this.auth.account()?.id;
    const starters: Person[] = [];
    const others: Person[] = [];
    const listed = new Set<string>();
    for (const discussion of this.found()) {
      if (!isDiscussion(discussion)) continue;
      for (const post of discussion.posts) {
        const id = post.account.id;
        if (isForeignCopy(post) || id === me || this.asked.has(id) || listed.has(id)) continue;
        listed.add(id);
        (post.id === discussion.anchor.id ? starters : others).push({
          id,
          person: personKey(post.account),
        });
      }
    }
    return [...starters, ...others];
  }

  private async relationships(people: Person[]): Promise<void> {
    const batch = people.slice(0, RELATIONSHIP_BATCH);
    for (const { id } of batch) this.asked.add(id);
    let answers: Relationship[] | typeof STOPPED;
    try {
      answers = await this.call(this.api.relationships(batch.map(({ id }) => id)));
    } catch (error) {
      if ((error as { status?: number })?.status === 429) throw error;
      return;
    }
    if (answers === STOPPED) return;
    const person = new Map(batch.map(({ id, person }) => [id, person]));
    const following = new Set(this.following());
    for (const answer of answers) {
      const key = person.get(answer.id);
      if (answer.following && key) following.add(key);
    }
    this.following.set(following);
  }
}
