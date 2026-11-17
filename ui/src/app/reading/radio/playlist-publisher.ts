import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';
import { postTitle } from './track-title';
import { LinkedAudioResolver } from './linked-audio-resolver';
import {
  entryText,
  PlaylistThread,
  playlistThreads,
  postRecordings,
  quoteEntryText,
  rootText,
} from './playlist-thread';
import { postHasPage } from './single-page';
import { RadioPlayer, RadioTrack } from './radio-player';
import {
  PublishedEntry,
  PublishedPlaylist,
  RadioPlaylists,
  SavedRadioPlaylist,
  trackUrl,
} from './radio-playlists';

// i18n radio.thread.root: {{count}} tracks, one per reply, each quoting the post it came from. Play them in order:
// i18n radio.thread.untitled: Playlist

/** Mastodon allows 30 deletions per 30 minutes per account. */
export const DELETE_BUDGET = 30;
const SCAN_PAGES = 5;

/** What publishing or updating a thread will do, shown before anything is sent. */
export interface PublishPlan {
  /** Create the root post: the playlist is not published yet. */
  createRoot: boolean;
  editRoot: boolean;
  edit: { entry: PublishedEntry; index: number; track: RadioTrack; title: string }[];
  remove: PublishedEntry[];
  post: { index: number; track: RadioTrack; title: string }[];
  /** Why it cannot run: private tracks, or removals in a thread we did not lay out. */
  blocked: '' | 'private' | 'notEditable' | 'empty';
}

/** The Mawkingbird player's address for a posted playlist thread: it reads the thread. */
export function playerLink(rootUrl: string): string {
  const url = new URL('playlists/shared', document.baseURI);
  url.searchParams.set('post', rootUrl);
  return url.href;
}

/**
 * Publishes a saved playlist as a self-reply thread: a root post with its name
 * and a link to play it here, then one numbered reply per track that quotes the
 * post the recording came from, so its author, words and replies stay with it.
 * Progress is saved after every request, so an interrupted publication resumes
 * rather than posting duplicates.
 */
@Injectable({ providedIn: 'root' })
export class PlaylistPublisher {
  private readonly api = inject(Api);
  private readonly transloco = inject(TranslocoService);
  private readonly player = inject(RadioPlayer);
  private readonly playlists = inject(RadioPlaylists);
  private readonly linked = inject(LinkedAudioResolver);
  readonly busy = signal(false);
  readonly progress = signal<{ done: number; total: number } | null>(null);
  readonly failed = signal(false);
  readonly found = signal<PlaylistThread[] | null>(null);
  readonly finding = signal(false);

  plan(row: SavedRadioPlaylist): PublishPlan {
    const tracks = row.tracks;
    const published = row.published;
    const titled = tracks.map((track) => ({ track, title: this.player.title(track) }));
    const blocked: PublishPlan['blocked'] = !tracks.length
      ? 'empty'
      : tracks.some((track) => !trackUrl(track))
        ? 'private'
        : '';
    if (!published)
      return {
        createRoot: true,
        editRoot: false,
        edit: [],
        remove: [],
        post: titled.map((item, index) => ({ ...item, index })),
        blocked,
      };
    const entries = published.entries;
    let prefix = 0;
    while (
      prefix < entries.length &&
      prefix < tracks.length &&
      entries[prefix].key === tracks[prefix].key
    )
      prefix++;
    const remove = entries.slice(prefix);
    return {
      createRoot: false,
      editRoot:
        published.name !== row.name ||
        published.description !== (row.description ?? '') ||
        entries.length !== tracks.length,
      edit: published.editable
        ? titled
            .slice(0, prefix)
            .map((item, index) => ({ ...item, index, entry: entries[index] }))
            .filter((item) => item.entry.title !== item.title)
        : [],
      remove,
      post: titled.slice(prefix).map((item, offset) => ({ ...item, index: prefix + offset })),
      blocked: blocked || (remove.length && !published.editable ? 'notEditable' : ''),
    };
  }

  /** Requests the plan sends: shown so the cost of a reorder is visible. */
  cost(plan: PublishPlan): number {
    return (
      // A new root is posted, then edited once its address can go in its player link.
      Number(plan.createRoot) * 2 +
      Number(plan.editRoot) +
      plan.edit.length +
      plan.remove.length +
      plan.post.length
    );
  }

  async publish(rowId: string, visibility: string): Promise<boolean> {
    const row = this.playlists.saved().find((item) => item.id === rowId);
    if (!row || this.busy()) return false;
    const plan = this.plan(row);
    if (plan.blocked) return false;
    this.busy.set(true);
    this.failed.set(false);
    let done = 0;
    const total = this.cost(plan);
    this.progress.set({ done, total });
    const step = () => this.progress.set({ done: ++done, total });
    const label = this.transloco.translate('radio.thread.root');
    try {
      let published: PublishedPlaylist | undefined = row.published;
      if (!published) {
        const root = await this.send(
          this.api.postStatus(
            rootText(row.name, row.description ?? '', row.tracks.length, label),
            { visibility },
            `mb-playlist-${row.id}-root`,
          ),
        );
        published = {
          rootId: root.id,
          url: root.url ?? '',
          visibility,
          name: row.name,
          description: row.description ?? '',
          entries: [],
          editable: true,
        };
        this.record(rowId, published);
        step();
        // Only now is the thread's address known, for the link that plays it here.
        if (published.url)
          await this.send(
            this.api.editStatus(
              published.rootId,
              rootText(
                row.name,
                row.description ?? '',
                row.tracks.length,
                label,
                playerLink(published.url),
              ),
            ),
          );
        step();
      }
      for (const entry of plan.remove) {
        await this.send(this.api.deleteStatus(entry.postId));
        published = { ...published, entries: published.entries.filter((e) => e !== entry) };
        this.record(rowId, published);
        step();
      }
      for (const item of plan.edit) {
        await this.send(
          this.api.editStatus(
            item.entry.postId,
            this.entryBody(item.index, item.title, item.track, !!item.entry.quoted),
          ),
        );
        published = {
          ...published,
          entries: published.entries.map((e) =>
            e === item.entry ? { ...e, title: item.title } : e,
          ),
        };
        this.record(rowId, published);
        step();
      }
      // Replies are unlisted under a public root, so the playlist does not flood timelines.
      const replyVisibility = published.visibility === 'public' ? 'unlisted' : published.visibility;
      for (const item of plan.post) {
        const parent: string = published.entries.at(-1)?.postId ?? published.rootId;
        const quoteId = await this.quotableId(item.track);
        const reply: Status = await this.send(
          this.api.postStatus(
            this.entryBody(item.index, item.title, item.track, !!quoteId),
            {
              inReplyToId: parent,
              visibility: replyVisibility,
              ...(quoteId ? { quotedStatusId: quoteId } : {}),
            },
            `mb-playlist-${row.id}-${parent}-${item.track.key}`,
          ),
        );
        // A server without quotes ignores the request; the reply then links the post instead.
        const quoted = !!quoteId && !!reply.quote;
        if (quoteId && !quoted)
          await this.send(
            this.api.editStatus(
              reply.id,
              this.entryBody(item.index, item.title, item.track, false),
            ),
          );
        published = {
          ...published,
          entries: [
            ...published.entries,
            {
              key: item.track.key,
              postId: reply.id,
              title: item.title,
              ...(quoted ? { quoted: true } : {}),
            },
          ],
        };
        this.record(rowId, published);
        step();
      }
      if (plan.editRoot || published.name !== row.name) {
        await this.send(
          this.api.editStatus(
            published.rootId,
            rootText(
              row.name,
              row.description ?? '',
              row.tracks.length,
              label,
              published.url ? playerLink(published.url) : '',
            ),
          ),
        );
        published = { ...published, name: row.name, description: row.description ?? '' };
        this.record(rowId, published);
        step();
      }
      return true;
    } catch {
      this.failed.set(true);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Scan the account's recent posts for self-reply threads holding two or more recordings. */
  async find(): Promise<void> {
    if (this.finding()) return;
    this.finding.set(true);
    this.failed.set(false);
    try {
      const me = await this.send(this.api.verifyCredentials());
      const posts: Status[] = [];
      let maxId: string | undefined;
      for (let page = 0; page < SCAN_PAGES; page++) {
        const batch = await this.send(
          this.api.getAccountStatuses(me.id, { maxId, limit: 40, excludeReblogs: true }),
        );
        posts.push(...batch);
        if (batch.length < 40) break;
        maxId = batch.at(-1)!.id;
      }
      const known = new Set(
        this.playlists.saved().flatMap((row) => (row.published ? [row.published.rootId] : [])),
      );
      this.found.set(playlistThreads(posts, me.id).filter((thread) => !known.has(thread.root.id)));
    } catch {
      this.failed.set(true);
    } finally {
      this.finding.set(false);
    }
  }

  /**
   * Save a found thread as a playlist linked to it. One track is kept per
   * recording; replies holding a single recording can later be edited in place.
   */
  async adopt(thread: PlaylistThread): Promise<string | null> {
    await this.linked.ready(thread.posts);
    const entries: PublishedEntry[] = [];
    const tracks: RadioTrack[] = [];
    let editable = postRecordings(thread.root).length === 0;
    for (const post of thread.posts) {
      const recordings = postRecordings(post).length;
      const chosen = this.recordingTracks(post).slice(0, Math.max(1, recordings));
      if (post !== thread.root && recordings !== 1) editable = false;
      for (const track of chosen) {
        tracks.push(track);
        entries.push({ key: track.key, postId: post.id, title: this.player.title(track) });
      }
    }
    if (!tracks.length) return null;
    const name = postTitle(thread.root) || this.transloco.translate('radio.thread.untitled');
    const id = this.playlists.create(name, tracks);
    if (!id) return null;
    this.record(id, {
      rootId: thread.root.id,
      url: thread.root.url ?? '',
      visibility: thread.root.visibility,
      name,
      description: '',
      entries,
      editable,
    });
    this.found.update((list) => list?.filter((item) => item !== thread) ?? null);
    return id;
  }

  /**
   * The post a track came from, when it is a Mastodon post others can open:
   * its recording is credited by quoting it, never by linking the bare file.
   */
  private origin(track: RadioTrack): Status | null {
    const post = track.post;
    return postHasPage(post) && ['public', 'unlisted'].includes(post.visibility) && !!post.url
      ? post
      : null;
  }

  /**
   * The id this server knows the original post by, to quote it; null when it
   * cannot be quoted (another server's copy that will not resolve, or an
   * author who does not allow quotes). The reply then links the post instead.
   */
  private async quotableId(track: RadioTrack): Promise<string | null> {
    const post = this.origin(track);
    if (!post || post.quote_approval?.current_user === 'denied') return null;
    if (post.provider !== 'anonymous-mastodon' && /^\d+$/.test(post.id)) return post.id;
    try {
      const found = await this.send(
        this.api.search(post.uri || post.url!, 'statuses', { resolve: true, limit: 1 }),
      );
      const local = found.statuses[0];
      return local && local.quote_approval?.current_user !== 'denied' ? local.id : null;
    } catch {
      return null;
    }
  }

  /** A reply's text: title and author beside the quoted post, or with its link, or a catalogue link. */
  private entryBody(index: number, title: string, track: RadioTrack, quoted: boolean): string {
    const post = this.origin(track);
    if (!post) return entryText(index, title, trackUrl(track)!);
    return quoteEntryText(index, title, post.account.acct, quoted ? '' : post.url!);
  }

  /** Native recordings each, plus the first playable alternative for the post's links. */
  private recordingTracks(post: Status): RadioTrack[] {
    // A posted thread's page-only players (Spotify, Bandcamp…) are kept and marked;
    // a reply quoting the original post holds that post's recordings.
    const tracks = [
      ...this.player.singleTracks(post),
      ...(post.quote?.quoted_status ? this.player.singleTracks(post.quote.quoted_status) : []),
    ];
    const native = tracks.filter((track) => !track.external);
    return native.length ? native : tracks.slice(0, 1);
  }

  private record(id: string, published: PublishedPlaylist): void {
    this.playlists.update(id, (row) => ({ ...row, published }));
  }

  private send<T>(source: Observable<T>): Promise<T> {
    return firstValueFrom(source.pipe(timeout(60_000)));
  }
}
