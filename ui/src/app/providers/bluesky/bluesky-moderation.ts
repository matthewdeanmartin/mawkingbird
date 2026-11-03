import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BlueskyApi } from './bluesky-api';
import { BlueskyModerationState, BskyMutedWord } from './bluesky-moderation-state';
import { BlueskySession } from './bluesky-session';
import { BskyListView } from './bluesky-types';

const MUTED_WORDS_PREF = 'app.bsky.actor.defs#mutedWordsPref';
const LABELERS_PREF = 'app.bsky.actor.defs#labelersPref';

type Preference = { $type?: string } & Record<string, unknown>;

/** A subscribed moderation list, as the settings page shows it. */
export interface BskyModerationList {
  uri: string;
  name: string;
  purpose: 'mute' | 'block';
  creator?: string;
  /** The listblock record to delete when unsubscribing a block list. */
  blockRecord?: string;
}

/** A subscribed moderation service (labeler). */
export interface BskyLabelerEntry {
  did: string;
  name: string;
  handle?: string;
}

/**
 * Bluesky's own moderation, beyond block and mute.
 *
 * Muted words and subscribed moderation services live in the account's
 * preferences (`app.bsky.actor.getPreferences`), which bsky.app shares. A
 * `putPreferences` write replaces the whole list, so every change re-reads it
 * right before writing and replaces only the one item it edits: anything else
 * bsky.app keeps there (feeds, content filters, thread settings) survives.
 * Moderation lists are separate: `muteActorList` for mute lists, a `listblock`
 * record for block lists.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyModeration {
  private api = inject(BlueskyApi);
  private session = inject(BlueskySession);
  private state = inject(BlueskyModerationState);
  private loading: Promise<void> | null = null;

  /** Load muted words and moderation services once per linked account. */
  ensureLoaded(): Promise<void> {
    const did = this.session.session()?.did;
    if (!did) return Promise.resolve();
    if (!this.loading || this.state.viewerDid() !== did) {
      this.loading = this.reload().catch(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  async reload(): Promise<void> {
    const preferences = await this.preferences();
    this.state.viewerDid.set(this.session.session()?.did);
    this.state.mutedWords.set(mutedWordsOf(preferences));
    this.state.labelers.set(labelersOf(preferences));
  }

  async addMutedWord(word: BskyMutedWord): Promise<void> {
    await this.editPreference(MUTED_WORDS_PREF, (current) => {
      const items = (current?.['items'] as BskyMutedWord[] | undefined) ?? [];
      const value = word.value.trim().replace(/^#/, '');
      const rest = items.filter((item) => item.value.toLowerCase() !== value.toLowerCase());
      return { ...current, $type: MUTED_WORDS_PREF, items: [...rest, { ...word, value }] };
    });
  }

  async removeMutedWord(value: string): Promise<void> {
    await this.editPreference(MUTED_WORDS_PREF, (current) => {
      const items = (current?.['items'] as BskyMutedWord[] | undefined) ?? [];
      return {
        ...current,
        $type: MUTED_WORDS_PREF,
        items: items.filter((item) => item.value !== value),
      };
    });
  }

  async labelers(): Promise<BskyLabelerEntry[]> {
    const dids = this.state.labelers();
    if (!dids.length) return [];
    let params = new HttpParams();
    for (const did of dids) params = params.append('dids', did);
    const { views } = await firstValueFrom(
      this.api.get<{ views: { creator: { did: string; handle: string; displayName?: string } }[] }>(
        'app.bsky.labeler.getServices',
        params,
      ),
    );
    return dids.map((did) => {
      const creator = views.find((view) => view.creator.did === did)?.creator;
      return { did, name: creator?.displayName || creator?.handle || did, handle: creator?.handle };
    });
  }

  /** Subscribe to a moderation service by its handle or DID. */
  async addLabeler(handleOrDid: string): Promise<void> {
    const did = await this.resolveDid(handleOrDid);
    const params = new HttpParams().append('dids', did);
    const { views } = await firstValueFrom(
      this.api.get<{ views: unknown[] }>('app.bsky.labeler.getServices', params),
    );
    if (!views.length) {
      throw new Error(`${handleOrDid} is not a Bluesky moderation service.`);
    }
    await this.editPreference(LABELERS_PREF, (current) => {
      const labelers = (current?.['labelers'] as { did: string }[] | undefined) ?? [];
      return labelers.some((entry) => entry.did === did)
        ? { ...current, $type: LABELERS_PREF, labelers }
        : { ...current, $type: LABELERS_PREF, labelers: [...labelers, { did }] };
    });
  }

  async removeLabeler(did: string): Promise<void> {
    await this.editPreference(LABELERS_PREF, (current) => {
      const labelers = (current?.['labelers'] as { did: string }[] | undefined) ?? [];
      return { ...current, $type: LABELERS_PREF, labelers: labelers.filter((l) => l.did !== did) };
    });
  }

  /** Subscribed mute lists and block lists. */
  async lists(): Promise<BskyModerationList[]> {
    const params = new HttpParams().set('limit', '100');
    const [mutes, blocks] = await Promise.all([
      firstValueFrom(
        this.api.get<{ lists: BskyListView[] }>('app.bsky.graph.getListMutes', params),
      ),
      firstValueFrom(
        this.api.get<{ lists: BskyListView[] }>('app.bsky.graph.getListBlocks', params),
      ),
    ]);
    const entry = (list: BskyListView, purpose: 'mute' | 'block'): BskyModerationList => ({
      uri: list.uri,
      name: list.name,
      purpose,
      creator: list.creator?.handle,
      ...(purpose === 'block' && list.viewer?.blocked ? { blockRecord: list.viewer.blocked } : {}),
    });
    return [
      ...mutes.lists.map((list) => entry(list, 'mute')),
      ...blocks.lists.map((list) => entry(list, 'block')),
    ];
  }

  /** Subscribe to a list by its bsky.app address or at-uri, as a mute or block list. */
  async subscribeList(address: string, purpose: 'mute' | 'block'): Promise<void> {
    const uri = await this.listUri(address);
    if (purpose === 'mute') {
      await firstValueFrom(this.api.request('app.bsky.graph.muteActorList', { list: uri }));
      return;
    }
    const did = this.session.session()?.did ?? '';
    await firstValueFrom(
      this.api.request('com.atproto.repo.createRecord', {
        repo: did,
        collection: 'app.bsky.graph.listblock',
        record: {
          $type: 'app.bsky.graph.listblock',
          subject: uri,
          createdAt: new Date().toISOString(),
        },
      }),
    );
  }

  async unsubscribeList(list: BskyModerationList): Promise<void> {
    if (list.purpose === 'mute') {
      await firstValueFrom(this.api.request('app.bsky.graph.unmuteActorList', { list: list.uri }));
    } else if (list.blockRecord) {
      await firstValueFrom(this.api.deleteRecord(list.blockRecord));
    }
  }

  /** Mute or unmute notifications from a thread, by its root post. */
  async setThreadMuted(rootUri: string, muted: boolean): Promise<void> {
    await firstValueFrom(
      this.api.request(muted ? 'app.bsky.graph.muteThread' : 'app.bsky.graph.unmuteThread', {
        root: rootUri,
      }),
    );
  }

  private async preferences(): Promise<Preference[]> {
    const { preferences } = await firstValueFrom(this.api.getPreferences());
    return preferences as Preference[];
  }

  /** Re-read, replace one preference item, write the whole list back, refresh the state. */
  private async editPreference(
    type: string,
    edit: (current: Preference | undefined) => Preference,
  ): Promise<void> {
    const preferences = await this.preferences();
    const current = preferences.find((pref) => pref.$type === type);
    const next = [...preferences.filter((pref) => pref.$type !== type), edit(current)];
    await firstValueFrom(this.api.request('app.bsky.actor.putPreferences', { preferences: next }));
    this.state.mutedWords.set(mutedWordsOf(next));
    this.state.labelers.set(labelersOf(next));
  }

  private async resolveDid(handleOrDid: string): Promise<string> {
    const value = handleOrDid.trim().replace(/^@/, '');
    if (value.startsWith('did:')) return value;
    const { did } = await firstValueFrom(this.api.resolveHandle(value));
    return did;
  }

  /** `https://bsky.app/profile/<handle>/lists/<rkey>` or an at-uri, as an at-uri. */
  private async listUri(address: string): Promise<string> {
    const value = address.trim();
    if (value.startsWith('at://')) return value;
    const match = /bsky\.app\/profile\/([^/]+)\/lists\/([^/?#]+)/.exec(value);
    if (!match) throw new Error('That is not a Bluesky list address.');
    const did = await this.resolveDid(decodeURIComponent(match[1]));
    return `at://${did}/app.bsky.graph.list/${match[2]}`;
  }
}

function mutedWordsOf(preferences: Preference[]): BskyMutedWord[] {
  const pref = preferences.find((p) => p.$type === MUTED_WORDS_PREF);
  return ((pref?.['items'] as BskyMutedWord[] | undefined) ?? []).filter((w) => !!w?.value);
}

function labelersOf(preferences: Preference[]): string[] {
  const pref = preferences.find((p) => p.$type === LABELERS_PREF);
  return ((pref?.['labelers'] as { did: string }[] | undefined) ?? []).map((l) => l.did);
}
