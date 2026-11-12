import { inject, Injectable } from '@angular/core';
import { catchError, firstValueFrom, Observable, of, timeout } from 'rxjs';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import {
  FediverseHandle,
  isDid,
  ParsedPerson,
  parsePerson,
} from '../../accounts/mastodon-analytics/fediverse-handle';
import { adaptPost } from '../../connections/bluesky/bluesky-adapter';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import {
  BskyPostView,
  BskySearchPosts,
  BskyTimeline,
} from '../../connections/bluesky/bluesky-types';
import { Account, Status } from '../../platform/api/models';

/**
 * Every visible exchange between two accounts: replies and mentions, either way.
 *
 * Mastodon has no "from:A to:B" across servers (a server only searches what it
 * has indexed), so the Mastodon path reads each account's recent public posts
 * from its own server and keeps those that mention the other — best effort,
 * bounded by how far back it reads, and it says how far that was.
 *
 * Bluesky's author feeds are public, so the same scan works with no account;
 * with a linked Bluesky account its post search (`author` + `mentions`) is
 * added, which reaches further back than any scan.
 *
 * Twitter is not here: `TwitterApi` deliberately has no search until a billed
 * response is captured as a fixture (see twitter-api.ts).
 */

export type InteractionNetwork = 'mastodon' | 'bluesky';

export interface InteractionResult {
  network: InteractionNetwork;
  /** Newest first, de-duplicated. */
  posts: Status[];
  /** Posts read from each account's history (scan only), in input order. */
  scanned: [number, number];
  /** True when Bluesky search ran in addition to the scan. */
  searched: boolean;
}

export type InteractionFailure =
  | { reason: 'invalid'; which: 0 | 1 }
  | { reason: 'mixed' }
  | { reason: 'same' }
  | { reason: 'notFound'; which: 0 | 1 };

/** Pages read per account. Mastodon pages are 40 posts; Bluesky's are 20. */
export const MASTODON_SCAN_PAGES = 5;
export const BLUESKY_SCAN_PAGES = 10;
const SEARCH_PAGES = 2;
const REQUEST_TIMEOUT_MS = 20_000;

/** Normalise a Mastodon `acct` seen on `server` to `user@host`, lower-cased. */
export function qualify(acct: string, serverHost: string): string {
  const bare = acct.replace(/^@/, '').toLowerCase();
  return bare.includes('@') ? bare : `${bare}@${serverHost}`;
}

/** Does this Mastodon post (read from `serverHost`) mention or reply to `target`? */
export function mastodonPostInvolves(
  status: Status,
  serverHost: string,
  target: { handle: string; url?: string },
): boolean {
  if (status.reblog) return false;
  return (status.mentions ?? []).some(
    (m) => qualify(m.acct, serverHost) === target.handle || (!!target.url && m.url === target.url),
  );
}

/** Does this Bluesky post reply to, mention or quote the account with DID `did`? */
export function blueskyPostInvolves(post: BskyPostView, did: string): boolean {
  const record = post.record;
  if (record.reply?.parent.uri.startsWith(`at://${did}/`)) return true;
  if (record.facets?.some((f) => f.features.some((feature) => feature.did === did))) return true;
  const embed = post.embed as { record?: { uri?: string; record?: { uri?: string } } } | undefined;
  const quoted = embed?.record?.uri ?? embed?.record?.record?.uri;
  return !!quoted && quoted.startsWith(`at://${did}/`);
}

@Injectable({ providedIn: 'root' })
export class InteractionFinder {
  private readonly anonymousPublic = inject(AnonymousPublicApi);
  private readonly bluesky = inject(BlueskyApi);
  private readonly blueskySession = inject(BlueskySession);

  /** Validate a pair before any request is made. */
  check(a: string, b: string): { people: [ParsedPerson, ParsedPerson] } | InteractionFailure {
    const first = parsePerson(a);
    if (!first) return { reason: 'invalid', which: 0 };
    const second = parsePerson(b);
    if (!second) return { reason: 'invalid', which: 1 };
    if (first.network !== second.network) return { reason: 'mixed' };
    if (first.label === second.label) return { reason: 'same' };
    return { people: [first, second] };
  }

  async find(a: string, b: string): Promise<InteractionResult | InteractionFailure> {
    const checked = this.check(a, b);
    if (!('people' in checked)) return checked;
    const [first, second] = checked.people;
    return first.network === 'mastodon' && second.network === 'mastodon'
      ? this.findMastodon(first.handle, second.handle)
      : this.findBluesky((first as { actor: string }).actor, (second as { actor: string }).actor);
  }

  private async findMastodon(
    a: FediverseHandle,
    b: FediverseHandle,
  ): Promise<InteractionResult | InteractionFailure> {
    const [accountA, accountB] = await Promise.all([this.lookup(a), this.lookup(b)]);
    if (!accountA) return { reason: 'notFound', which: 0 };
    if (!accountB) return { reason: 'notFound', which: 1 };
    const [fromA, fromB] = await Promise.all([
      this.scanMastodon(a, accountA, {
        handle: `${b.user}@${b.host}`.toLowerCase(),
        url: accountB.url,
      }),
      this.scanMastodon(b, accountB, {
        handle: `${a.user}@${a.host}`.toLowerCase(),
        url: accountA.url,
      }),
    ]);
    return {
      network: 'mastodon',
      posts: newestFirst([...fromA.matches, ...fromB.matches]),
      scanned: [fromA.read, fromB.read],
      searched: false,
    };
  }

  private lookup(handle: FediverseHandle): Promise<Account | null> {
    return settle(this.anonymousPublic.lookupAccount(`https://${handle.host}`, handle.user), null);
  }

  private async scanMastodon(
    handle: FediverseHandle,
    account: Account,
    target: { handle: string; url?: string },
  ): Promise<{ matches: Status[]; read: number }> {
    const ref = { server: `https://${handle.host}`, id: account.id };
    const matches: Status[] = [];
    let read = 0;
    let maxId: string | undefined;
    for (let page = 0; page < MASTODON_SCAN_PAGES; page++) {
      const statuses = await settle(
        this.anonymousPublic.getAccountStatuses(ref, { limit: 40, excludeReblogs: true, maxId }),
        [] as Status[],
      );
      if (!statuses.length) break;
      read += statuses.length;
      matches.push(...statuses.filter((s) => mastodonPostInvolves(s, handle.host, target)));
      const last = statuses[statuses.length - 1];
      const ref0 = last.providerRef as { statusId?: string } | undefined;
      maxId = ref0?.statusId ?? last.id;
    }
    return { matches, read };
  }

  private async findBluesky(a: string, b: string): Promise<InteractionResult | InteractionFailure> {
    const [didA, didB] = await Promise.all([this.did(a), this.did(b)]);
    if (!didA) return { reason: 'notFound', which: 0 };
    if (!didB) return { reason: 'notFound', which: 1 };
    const searched = this.blueskySession.linked();
    const [scanA, scanB, searchA, searchB] = await Promise.all([
      this.scanBluesky(didA, didB),
      this.scanBluesky(didB, didA),
      searched ? this.searchBluesky(didA, didB) : Promise.resolve([]),
      searched ? this.searchBluesky(didB, didA) : Promise.resolve([]),
    ]);
    const posts = [...scanA.matches, ...scanB.matches, ...searchA, ...searchB].map(adaptPost);
    return {
      network: 'bluesky',
      posts: newestFirst(posts),
      scanned: [scanA.read, scanB.read],
      searched,
    };
  }

  private async did(actor: string): Promise<string | null> {
    if (isDid(actor)) return actor;
    const profile = await settle(this.bluesky.getProfile(actor), null);
    return profile?.did ?? null;
  }

  private async scanBluesky(
    author: string,
    other: string,
  ): Promise<{ matches: BskyPostView[]; read: number }> {
    const matches: BskyPostView[] = [];
    let read = 0;
    let cursor: string | null = null;
    for (let page = 0; page < BLUESKY_SCAN_PAGES; page++) {
      const timeline: BskyTimeline | null = await settle(
        this.bluesky.getAuthorFeed(author, cursor, 'posts_with_replies', true),
        null,
      );
      if (!timeline?.feed.length) break;
      // Reposts are someone else's post; only the author's own words count.
      const own = timeline.feed.filter((item) => !item.reason && item.post.author.did === author);
      read += own.length;
      matches.push(
        ...own.map((item) => item.post).filter((post) => blueskyPostInvolves(post, other)),
      );
      if (!timeline.cursor) break;
      cursor = timeline.cursor;
    }
    return { matches, read };
  }

  private async searchBluesky(author: string, mentions: string): Promise<BskyPostView[]> {
    const found: BskyPostView[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < SEARCH_PAGES; page++) {
      const result: BskySearchPosts | null = await settle(
        this.bluesky.searchPosts({ text: '', author, mentions, sort: 'latest' }, cursor),
        null,
      );
      if (!result?.posts.length) break;
      found.push(...result.posts);
      if (!result.cursor) break;
      cursor = result.cursor;
    }
    return found;
  }
}

function newestFirst(posts: Status[]): Status[] {
  const seen = new Set<string>();
  return posts
    .filter((post) => (seen.has(post.id) ? false : (seen.add(post.id), true)))
    .sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
}

function settle<T, F>(source: Observable<T>, fallback: F): Promise<T | F> {
  return firstValueFrom(
    source.pipe(
      timeout(REQUEST_TIMEOUT_MS),
      catchError(() => of(fallback)),
    ),
    { defaultValue: fallback },
  );
}
