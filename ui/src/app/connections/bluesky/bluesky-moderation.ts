import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BlueskyApi } from './bluesky-api';
import { BlueskyModerationState, BskyMutedWord } from './bluesky-moderation-state';
import { BskyLabelVisibility, definitionsOf, labelPrefKey } from './bluesky-labels';
import {
  BlueskyPreferences,
  FEED_VIEW_PREF,
  POST_INTERACTION_PREF,
  THREAD_VIEW_PREF,
} from './bluesky-preferences';
import { controlsFromPref, homeFeedPrefsOf, threadSortOf } from './bluesky-reading-prefs';
import { BlueskySession } from './bluesky-session';
import { BskyListView, BskyProfile } from './bluesky-types';

/** One page of accounts the reader blocks or mutes. */
export interface BskyAccountPage {
  profiles: BskyProfile[];
  cursor: string | null;
}

const MUTED_WORDS_PREF = 'app.bsky.actor.defs#mutedWordsPref';
const LABELERS_PREF = 'app.bsky.actor.defs#labelersPref';
const ADULT_CONTENT_PREF = 'app.bsky.actor.defs#adultContentPref';
const CONTENT_LABEL_PREF = 'app.bsky.actor.defs#contentLabelPref';

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
  private prefs = inject(BlueskyPreferences);
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
    this.applyPreferences(preferences);
    await this.loadLabelDefinitions().catch(() => undefined);
  }

  /** Mirror the reading-side preferences into the state every card reads. */
  private applyPreferences(preferences: Preference[]): void {
    this.state.mutedWords.set(mutedWordsOf(preferences));
    this.state.labelers.set(labelersOf(preferences));
    this.state.adultContent.set(adultContentOf(preferences));
    this.state.labelPrefs.set(labelPrefsOf(preferences));
    this.state.homeFeedPrefs.set(
      homeFeedPrefsOf(preferences.find((p) => p.$type === FEED_VIEW_PREF && p['feed'] === 'home')),
    );
    this.state.threadSort.set(threadSortOf(preferences.find((p) => p.$type === THREAD_VIEW_PREF)));
    this.state.postDefaults.set(
      controlsFromPref(preferences.find((p) => p.$type === POST_INTERACTION_PREF)),
    );
    this.state.readingPrefsLoaded.set(true);
  }

  /**
   * Re-read and apply the reading preferences after a write elsewhere (the
   * Bluesky preferences page), so feeds and threads follow at once.
   */
  applyWritten(preferences: Preference[]): void {
    this.applyPreferences(preferences);
  }

  /**
   * The subscribed labelers' own label values, so their labels can warn or
   * hide by their definitions. A failure leaves only the global values, which
   * is what bsky.app shows while a labeler is unreachable.
   */
  private async loadLabelDefinitions(): Promise<void> {
    const dids = this.state.labelers();
    if (!dids.length) {
      this.state.labelDefs.set(new Map());
      return;
    }
    let params = new HttpParams().set('detailed', 'true');
    for (const did of dids) params = params.append('dids', did);
    const { views } = await firstValueFrom(
      this.api.get<{ views: LabelerDetail[] }>('app.bsky.labeler.getServices', params),
    );
    this.state.labelDefs.set(
      new Map(
        views.flatMap((view) =>
          definitionsOf(view.creator.did, view.policies?.labelValueDefinitions ?? []),
        ),
      ),
    );
  }

  async addMutedWord(word: BskyMutedWord): Promise<void> {
    await this.addMutedWords([word]);
  }

  /**
   * Mute several words in one preferences write. A word already muted (in any
   * case, with or without its #) takes the new rule; repeats within the list
   * collapse to one. Duplicates already in the account, from an older client or
   * bsky.app, are dropped quietly on the same write.
   */
  async addMutedWords(words: readonly BskyMutedWord[]): Promise<void> {
    const added = words
      .map((word) => ({ ...word, value: word.value.trim().replace(/^#/, '') }))
      .filter((word) => word.value);
    if (!added.length) return;
    await this.editPreference(MUTED_WORDS_PREF, (current) => ({
      ...current,
      $type: MUTED_WORDS_PREF,
      items: dedupeMutedWords([...itemsOf(current), ...added]),
    }));
  }

  /** Unmute a word: every stored copy of it, whatever its case or #. */
  async removeMutedWord(value: string): Promise<void> {
    const key = mutedWordKey(value);
    await this.editPreference(MUTED_WORDS_PREF, (current) => ({
      ...current,
      $type: MUTED_WORDS_PREF,
      items: dedupeMutedWords(itemsOf(current)).filter((item) => mutedWordKey(item.value) !== key),
    }));
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

  /** Accounts the reader blocks (`getBlocks`), a page at a time. */
  async blocks(cursor: string | null = null): Promise<BskyAccountPage> {
    return this.accountPage('app.bsky.graph.getBlocks', 'blocks', cursor);
  }

  /** Accounts the reader mutes (`getMutes`), a page at a time. */
  async mutes(cursor: string | null = null): Promise<BskyAccountPage> {
    return this.accountPage('app.bsky.graph.getMutes', 'mutes', cursor);
  }

  private async accountPage(
    nsid: string,
    key: 'blocks' | 'mutes',
    cursor: string | null,
  ): Promise<BskyAccountPage> {
    let params = new HttpParams().set('limit', '50');
    if (cursor) params = params.set('cursor', cursor);
    const page = await firstValueFrom(
      this.api.get<Partial<Record<'blocks' | 'mutes', BskyProfile[]>> & { cursor?: string }>(
        nsid,
        params,
      ),
    );
    const profiles = page[key] ?? [];
    return { profiles, cursor: profiles.length && page.cursor ? page.cursor : null };
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
    return this.prefs.read();
  }

  /** Show adult content on Bluesky (`adultContentPref`). */
  async setAdultContent(enabled: boolean): Promise<void> {
    await this.editPreference(ADULT_CONTENT_PREF, (current) => ({
      ...current,
      $type: ADULT_CONTENT_PREF,
      enabled,
    }));
  }

  /**
   * Set how one label shows (`contentLabelPref`): a global value when
   * `labelerDid` is absent, else that moderation service's own value.
   */
  async setLabelVisibility(
    label: string,
    visibility: BskyLabelVisibility,
    labelerDid?: string,
  ): Promise<void> {
    const next = await this.prefs.edit(
      (pref) =>
        pref.$type === CONTENT_LABEL_PREF &&
        pref['label'] === label &&
        (pref['labelerDid'] ?? undefined) === labelerDid,
      (current) => ({
        ...current,
        $type: CONTENT_LABEL_PREF,
        label,
        visibility,
        ...(labelerDid ? { labelerDid } : {}),
      }),
    );
    this.applyPreferences(next);
  }

  /** Re-read, replace one preference item, write the whole list back, refresh the state. */
  private async editPreference(
    type: string,
    edit: (current: Preference | undefined) => Preference,
  ): Promise<void> {
    const next = await this.prefs.edit(type, edit);
    const labelersChanged = type === LABELERS_PREF;
    this.applyPreferences(next);
    if (labelersChanged) await this.loadLabelDefinitions().catch(() => undefined);
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

function itemsOf(pref: Preference | undefined): BskyMutedWord[] {
  return (pref?.['items'] as BskyMutedWord[] | undefined) ?? [];
}

/** What makes two muted words the same: case and a leading # do not. */
export function mutedWordKey(value: string): string {
  return value.trim().replace(/^#/, '').toLowerCase();
}

/**
 * One entry per word, the last one winning (it is the newest rule), kept in
 * the position of that last entry. Empty values are dropped.
 */
export function dedupeMutedWords(items: readonly BskyMutedWord[]): BskyMutedWord[] {
  const last = new Map<string, number>();
  items.forEach((item, index) => {
    if (item?.value && mutedWordKey(item.value)) last.set(mutedWordKey(item.value), index);
  });
  return items.filter(
    (item, index) => !!item?.value && last.get(mutedWordKey(item.value)) === index,
  );
}

function mutedWordsOf(preferences: Preference[]): BskyMutedWord[] {
  const pref = preferences.find((p) => p.$type === MUTED_WORDS_PREF);
  return dedupeMutedWords(itemsOf(pref));
}

interface LabelerDetail {
  creator: { did: string };
  policies?: { labelValueDefinitions?: Parameters<typeof definitionsOf>[1] };
}

function adultContentOf(preferences: Preference[]): boolean {
  return preferences.find((p) => p.$type === ADULT_CONTENT_PREF)?.['enabled'] === true;
}

/** `contentLabelPref` entries; an unknown visibility is skipped, leaving the default. */
function labelPrefsOf(preferences: Preference[]): Map<string, BskyLabelVisibility> {
  const out = new Map<string, BskyLabelVisibility>();
  for (const pref of preferences) {
    if (pref.$type !== CONTENT_LABEL_PREF) continue;
    const label = pref['label'];
    const visibility = pref['visibility'];
    const labeler = pref['labelerDid'];
    if (typeof label !== 'string') continue;
    if (
      visibility !== 'ignore' &&
      visibility !== 'show' &&
      visibility !== 'warn' &&
      visibility !== 'hide'
    )
      continue;
    out.set(labelPrefKey(label, typeof labeler === 'string' ? labeler : undefined), visibility);
  }
  return out;
}

function labelersOf(preferences: Preference[]): string[] {
  const pref = preferences.find((p) => p.$type === LABELERS_PREF);
  return ((pref?.['labelers'] as { did: string }[] | undefined) ?? []).map((l) => l.did);
}
