import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BlueskyApi } from './bluesky-api';
import { BlueskySession } from './bluesky-session';
import { BSKY_CURATE_LIST, BskyListView } from './bluesky-types';

export const BSKY_MOD_LIST = 'app.bsky.graph.defs#modlist';

/** One of the reader's own lists, and whether a given account is on it. */
export interface BskyListMembership {
  list: BskyListView;
  /** The listitem record putting the account on this list, or null. */
  itemUri: string | null;
}

/** applyWrites takes at most this many writes per call. */
const WRITE_BATCH = 200;

/**
 * The reader's own Bluesky lists: curated lists (readable as feeds) and
 * moderation lists (to mute or block everyone on them). Each list is an
 * `app.bsky.graph.list` record in the reader's repository and each member a
 * `listitem` record, so bsky.app shows every change here at once.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyLists {
  private api = inject(BlueskyApi);
  private session = inject(BlueskySession);

  /** The reader's curated and moderation lists, each marked with `actor`'s membership. */
  async membership(actor: string): Promise<BskyListMembership[]> {
    const params = new HttpParams()
      .set('actor', actor)
      .set('limit', '100')
      .append('purposes', 'curatelist')
      .append('purposes', 'modlist');
    const { listsWithMembership } = await firstValueFrom(
      this.api.get<{
        listsWithMembership: { list: BskyListView; listItem?: { uri: string } }[];
      }>('app.bsky.graph.getListsWithMembership', params),
    );
    return listsWithMembership
      .filter((row) => row.list.purpose === BSKY_CURATE_LIST || row.list.purpose === BSKY_MOD_LIST)
      .map((row) => ({ list: row.list, itemUri: row.listItem?.uri ?? null }));
  }

  /** Create a list; resolves to its at-uri. */
  async create(name: string, purpose: 'curate' | 'mod', description = ''): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A list needs a name.');
    const { uri } = await firstValueFrom(
      this.api.request<{ uri: string }>('com.atproto.repo.createRecord', {
        repo: this.did(),
        collection: 'app.bsky.graph.list',
        record: {
          $type: 'app.bsky.graph.list',
          name: trimmed.slice(0, 64),
          purpose: purpose === 'mod' ? BSKY_MOD_LIST : BSKY_CURATE_LIST,
          ...(description.trim() ? { description: description.trim() } : {}),
          createdAt: new Date().toISOString(),
        },
      }),
    );
    return uri;
  }

  /** Put an account on a list; resolves to the listitem's at-uri. */
  async add(listUri: string, subjectDid: string): Promise<string> {
    const { uri } = await firstValueFrom(
      this.api.request<{ uri: string }>('com.atproto.repo.createRecord', {
        repo: this.did(),
        collection: 'app.bsky.graph.listitem',
        record: {
          $type: 'app.bsky.graph.listitem',
          subject: subjectDid,
          list: listUri,
          createdAt: new Date().toISOString(),
        },
      }),
    );
    return uri;
  }

  async remove(itemUri: string): Promise<void> {
    await firstValueFrom(this.api.deleteRecord(itemUri));
  }

  /**
   * Delete a list and every listitem pointing at it, as bsky.app does, so no
   * orphaned membership records are left in the repository.
   */
  async deleteList(listUri: string): Promise<void> {
    const did = this.did();
    const itemKeys: string[] = [];
    let cursor: string | undefined;
    do {
      let params = new HttpParams().set('list', listUri).set('limit', '100');
      if (cursor) params = params.set('cursor', cursor);
      const page = await firstValueFrom(
        this.api.get<{ items: { uri: string }[]; cursor?: string }>(
          'app.bsky.graph.getList',
          params,
        ),
      );
      itemKeys.push(...page.items.map((item) => item.uri.split('/').pop()!));
      cursor = page.items.length ? page.cursor : undefined;
    } while (cursor);
    const writes = [
      ...itemKeys.map((rkey) => ({ collection: 'app.bsky.graph.listitem', rkey })),
      { collection: 'app.bsky.graph.list', rkey: listUri.split('/').pop()! },
    ].map((write) => ({ $type: 'com.atproto.repo.applyWrites#delete', ...write }));
    for (let i = 0; i < writes.length; i += WRITE_BATCH) {
      await firstValueFrom(
        this.api.request('com.atproto.repo.applyWrites', {
          repo: did,
          writes: writes.slice(i, i + WRITE_BATCH),
        }),
      );
    }
  }

  private did(): string {
    const did = this.session.session()?.did;
    if (!did) throw new Error('No Bluesky account is linked.');
    return did;
  }
}
