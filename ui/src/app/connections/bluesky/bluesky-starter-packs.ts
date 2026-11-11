import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BlueskyApi, tidFromSeed } from './bluesky-api';
import { BlueskySession } from './bluesky-session';
import { BskyListView, BskyProfile } from './bluesky-types';

/** Bluesky's cap on a starter pack's members. */
export const STARTER_PACK_MAX_MEMBERS = 150;

/** `app.bsky.graph.starterpack` as stored. */
export interface StarterPackRecord {
  name: string;
  description?: string;
  list: string;
  createdAt: string;
}

/** `app.bsky.graph.defs#starterPackViewBasic`, what profile listings return. */
export interface StarterPackSummary {
  uri: string;
  record: StarterPackRecord;
  creator: BskyProfile;
  listItemCount?: number;
  joinedAllTimeCount?: number;
}

/** A starter pack with every member loaded, for its own page. */
export interface StarterPack extends StarterPackSummary {
  members: BskyProfile[];
}

/** Where a pack lives in Mawkingbird: `/bluesky/starter-packs/<actor>/<rkey>`. */
export function starterPackPath(uri: string): string[] {
  const [actor, , rkey] = uri.replace('at://', '').split('/');
  return ['/bluesky/starter-packs', actor, rkey];
}

/**
 * Bluesky starter packs: a named, shareable set of accounts to follow at once.
 *
 * Mawkingbird's own Starter Kits are bundled collections; these are the
 * packs people make on Bluesky, read and written through Bluesky's API. A
 * pack points at a reference list, which holds the members.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyStarterPacks {
  private api = inject(BlueskyApi);
  private session = inject(BlueskySession);

  /** `https://bsky.app/starter-pack/<handle>/<rkey>` or an at-uri, as an at-uri. */
  async uriFromAddress(address: string): Promise<string> {
    const value = address.trim();
    if (value.startsWith('at://')) return value;
    const match = /bsky\.app\/starter-pack\/([^/]+)\/([^/?#]+)/.exec(value);
    if (!match) throw new Error('That is not a Bluesky starter pack address.');
    return this.uriFor(decodeURIComponent(match[1]), match[2]);
  }

  /** The at-uri of a pack from its creator (handle or DID) and record key. */
  async uriFor(actor: string, rkey: string): Promise<string> {
    const did = actor.startsWith('did:')
      ? actor
      : (await firstValueFrom(this.api.resolveHandle(actor.replace(/^@/, '')))).did;
    return `at://${did}/app.bsky.graph.starterpack/${rkey}`;
  }

  /** A pack and all its members (up to Bluesky's 150). Readable without an account. */
  async load(uri: string): Promise<StarterPack> {
    const { starterPack } = await firstValueFrom(
      this.api.publicGet<{
        starterPack: StarterPackSummary & { list?: { uri: string; listItemCount?: number } };
      }>('app.bsky.graph.getStarterPack', new HttpParams().set('starterPack', uri)),
    );
    const members: BskyProfile[] = [];
    let cursor: string | undefined;
    const list = starterPack.list?.uri ?? starterPack.record.list;
    do {
      let params = new HttpParams().set('list', list).set('limit', '100');
      if (cursor) params = params.set('cursor', cursor);
      const page = await firstValueFrom(
        this.api.publicGet<{ items: { subject: BskyProfile }[]; cursor?: string }>(
          'app.bsky.graph.getList',
          params,
        ),
      );
      members.push(...page.items.map((item) => item.subject));
      cursor = page.items.length ? page.cursor : undefined;
    } while (cursor && members.length < STARTER_PACK_MAX_MEMBERS);
    return {
      ...starterPack,
      listItemCount: starterPack.list?.listItemCount ?? members.length,
      members,
    };
  }

  /** Packs an account made. */
  async byActor(actor: string): Promise<StarterPackSummary[]> {
    const { starterPacks } = await firstValueFrom(
      this.api.publicGet<{ starterPacks: StarterPackSummary[] }>(
        'app.bsky.graph.getActorStarterPacks',
        new HttpParams().set('actor', actor).set('limit', '50'),
      ),
    );
    return starterPacks;
  }

  /** The signed-in account's own lists, as sources for a new pack. */
  async ownLists(): Promise<BskyListView[]> {
    const did = this.session.session()?.did ?? '';
    const { lists } = await firstValueFrom(
      this.api.get<{ lists: BskyListView[] }>(
        'app.bsky.graph.getLists',
        new HttpParams().set('actor', did).set('limit', '100'),
      ),
    );
    return lists.filter((list) => list.purpose === 'app.bsky.graph.defs#curatelist');
  }

  /** Members of one of the account's lists. */
  async listMembers(uri: string): Promise<BskyProfile[]> {
    const members: BskyProfile[] = [];
    let cursor: string | undefined;
    do {
      let params = new HttpParams().set('list', uri).set('limit', '100');
      if (cursor) params = params.set('cursor', cursor);
      const page = await firstValueFrom(
        this.api.get<{ items: { subject: BskyProfile }[]; cursor?: string }>(
          'app.bsky.graph.getList',
          params,
        ),
      );
      members.push(...page.items.map((item) => item.subject));
      cursor = page.items.length ? page.cursor : undefined;
    } while (cursor);
    return members;
  }

  /**
   * Create a pack: a new reference list holding the members, and the pack
   * record pointing at it, in one atomic `applyWrites`, as bsky.app does.
   * Returns the new pack's at-uri.
   */
  async create(name: string, description: string, members: string[]): Promise<string> {
    const did = this.session.session()?.did;
    if (!did) throw new Error('No Bluesky account is linked.');
    const unique = [...new Set(members)].slice(0, STARTER_PACK_MAX_MEMBERS);
    const seed = `${did}:${Date.now()}`;
    const listKey = tidFromSeed(`${seed}:list`);
    const packKey = tidFromSeed(`${seed}:pack`);
    const listUri = `at://${did}/app.bsky.graph.list/${listKey}`;
    const createdAt = new Date().toISOString();
    const writes = [
      {
        $type: 'com.atproto.repo.applyWrites#create',
        collection: 'app.bsky.graph.list',
        rkey: listKey,
        value: {
          $type: 'app.bsky.graph.list',
          purpose: 'app.bsky.graph.defs#referencelist',
          name,
          createdAt,
        },
      },
      ...unique.map((subject, index) => ({
        $type: 'com.atproto.repo.applyWrites#create',
        collection: 'app.bsky.graph.listitem',
        rkey: tidFromSeed(`${seed}:item:${index}`),
        value: { $type: 'app.bsky.graph.listitem', subject, list: listUri, createdAt },
      })),
      {
        $type: 'com.atproto.repo.applyWrites#create',
        collection: 'app.bsky.graph.starterpack',
        rkey: packKey,
        value: {
          $type: 'app.bsky.graph.starterpack',
          name,
          ...(description ? { description } : {}),
          list: listUri,
          createdAt,
        },
      },
    ];
    await firstValueFrom(this.api.request('com.atproto.repo.applyWrites', { repo: did, writes }));
    return `at://${did}/app.bsky.graph.starterpack/${packKey}`;
  }

  /** Bluesky's suggestions for the signed-in account. */
  async suggestions(): Promise<BskyProfile[]> {
    const { actors } = await firstValueFrom(
      this.api.get<{ actors: BskyProfile[] }>(
        'app.bsky.actor.getSuggestions',
        new HttpParams().set('limit', '10'),
      ),
    );
    return actors;
  }

  /** Accounts like this one, as Bluesky offers after a follow. */
  async similarTo(actor: string): Promise<BskyProfile[]> {
    const { suggestions } = await firstValueFrom(
      this.api.get<{ suggestions: BskyProfile[] }>(
        'app.bsky.graph.getSuggestedFollowsByActor',
        new HttpParams().set('actor', actor),
      ),
    );
    return suggestions;
  }
}
