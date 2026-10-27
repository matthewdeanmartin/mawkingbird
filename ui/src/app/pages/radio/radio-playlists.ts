import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { accountScopeSuffix } from '../../account-scope';
import { externalMedia } from '../../audio-embeds/providers';
import {
  directAudioUrl,
  linkedAttachment,
  locItemIds,
  locItems,
} from '../../audio-embeds/linked-audio';
import { LinkedAudioResolver } from './linked-audio-resolver';
import { fileTitle } from './track-title';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { radioPostRef } from '../../radio-links';
import { Status } from '../../models';
import { RadioPlayer, RadioTrack } from './radio-player';

/** One published entry: the reply that carries a track, and the title it shows. */
export interface PublishedEntry {
  key: string;
  postId: string;
  title: string;
}
/** The Mastodon thread a saved playlist is published as. */
export interface PublishedPlaylist {
  rootId: string;
  url: string;
  visibility: string;
  name: string;
  description: string;
  entries: PublishedEntry[];
  /** One track per reply, so entries can be edited or deleted individually. */
  editable: boolean;
}
export interface SavedRadioPlaylist {
  id: string;
  name: string;
  description?: string;
  tracks: RadioTrack[];
  published?: PublishedPlaylist;
}

function publishedRecord(value: unknown): PublishedPlaylist | undefined {
  const data = value as Partial<PublishedPlaylist> | null;
  if (
    !data ||
    typeof data.rootId !== 'string' ||
    typeof data.url !== 'string' ||
    !Array.isArray(data.entries)
  )
    return undefined;
  return {
    rootId: data.rootId,
    url: data.url,
    visibility: typeof data.visibility === 'string' ? data.visibility : 'public',
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    editable: data.editable === true,
    entries: data.entries.filter(
      (entry): entry is PublishedEntry =>
        typeof entry?.key === 'string' &&
        typeof entry?.postId === 'string' &&
        typeof entry?.title === 'string',
    ),
  };
}
const KEY = 'mockingbird_radio_playlists';
export const PLAYLIST_LIMIT = 200;

/** Public URL lists are portable; local playlists retain private post metadata locally. */
export function trackUrl(track: RadioTrack): string | null {
  if (!['public', 'unlisted'].includes(track.post.visibility)) return null;
  if (track.post.spoiler_text || track.post.sensitive) return track.post.url || null;
  return (
    track.external?.url ||
    (/^https:/i.test(track.media.url) &&
    /\.(mp3|ogg|oga|wav|m4a|flac|opus|aac)(?:[?#]|$)/i.test(track.media.url)
      ? track.media.url
      : track.post.url) ||
    null
  );
}
export function playlistUrls(tracks: RadioTrack[]): string[] {
  return [...new Set(tracks.map(trackUrl).filter((url): url is string => !!url))];
}
export function playlistFragment(urls: string[]): string {
  return 'playlist=' + encodeURIComponent(JSON.stringify(urls));
}
export function readPlaylistFragment(fragment: string): string[] | null {
  if (!fragment.startsWith('playlist=') || fragment.length > 100_000) return null;
  try {
    const data: unknown = JSON.parse(decodeURIComponent(fragment.slice(9)));
    return Array.isArray(data) &&
      data.length <= PLAYLIST_LIMIT &&
      data.every((url) => typeof url === 'string' && url.length < 4096)
      ? data
      : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class RadioPlaylists {
  private readonly player = inject(RadioPlayer);
  private readonly api = inject(AnonymousPublicApi);
  private readonly linked = inject(LinkedAudioResolver);
  readonly saved = signal<SavedRadioPlaylist[]>([]);
  readonly error = signal(false);
  private key = '';
  refresh(): void {
    this.key = KEY + accountScopeSuffix();
    this.error.set(false);
    try {
      const data: unknown = JSON.parse(localStorage.getItem(this.key) ?? '[]');
      this.saved.set(
        Array.isArray(data)
          ? data
              .filter(
                (item) =>
                  typeof item?.id === 'string' &&
                  typeof item?.name === 'string' &&
                  Array.isArray(item?.tracks),
              )
              .map((item) => ({
                id: item.id,
                name: item.name,
                ...(typeof item.description === 'string' && item.description
                  ? { description: item.description }
                  : {}),
                tracks: this.validate(item.tracks),
                ...(publishedRecord(item.published)
                  ? { published: publishedRecord(item.published) }
                  : {}),
              }))
          : [],
      );
    } catch {
      this.saved.set([]);
      this.error.set(true);
    }
  }
  private validate(items: RadioTrack[]): RadioTrack[] {
    return items.flatMap((item) => {
      if (!item?.post?.account || !Array.isArray(item.post.media_attachments)) return [];
      return this.player
        .tracks(item.post)
        .filter((track) => track.key === item.key)
        .map((track) =>
          typeof item.title === 'string' && item.title.trim()
            ? { ...track, title: item.title.trim().slice(0, 200) }
            : track,
        );
    });
  }
  /** The saved playlist the queue was loaded from or last saved as. */
  readonly active = signal<string | null>(null);
  /**
   * Save the queue. The active playlist is updated in place under the same name,
   * and a published one also when renamed (the thread follows); otherwise a new
   * name, or `asNew`, starts a separate playlist.
   */
  save(name: string, tracks: RadioTrack[], description = '', asNew = false): string | null {
    this.refresh();
    if (!name.trim() || !tracks.length) return null;
    const active = this.saved().find((row) => row.id === this.active());
    const current =
      !asNew && active && (active.name === name.trim() || active.published) ? active : undefined;
    const row: SavedRadioPlaylist = {
      ...(current ?? {}),
      id: current?.id ?? crypto.randomUUID(),
      name: name.trim(),
      tracks: this.validate(tracks),
    };
    if (description.trim()) row.description = description.trim().slice(0, 1000);
    else delete row.description;
    this.write(
      this.saved().some((item) => item.id === row.id)
        ? this.saved().map((item) => (item.id === row.id ? row : item))
        : [...this.saved(), row],
    );
    if (!this.error()) this.active.set(row.id);
    return this.error() ? null : row.id;
  }
  /** Replace one saved row, as publication progresses. */
  update(id: string, change: (row: SavedRadioPlaylist) => SavedRadioPlaylist): boolean {
    this.refresh();
    const rows = this.saved();
    if (!rows.some((row) => row.id === id)) return false;
    this.write(rows.map((row) => (row.id === id ? change(row) : row)));
    return !this.error();
  }
  remove(id: string): void {
    this.refresh();
    this.write(this.saved().filter((item) => item.id !== id));
    if (this.active() === id) this.active.set(null);
  }
  private write(rows: SavedRadioPlaylist[]): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(rows));
      this.saved.set(rows);
      this.error.set(false);
    } catch {
      this.error.set(true);
    }
  }
  /** Only self-replies connected to the supplied post belong to its playlist thread. */
  async importPost(url: string, thread: boolean): Promise<RadioTrack[]> {
    const ref = radioPostRef(url);
    if (!ref) return [];
    const root = await firstValueFrom(this.api.getStatus(ref));
    const posts = [root];
    if (thread) {
      const context = await firstValueFrom(this.api.getContext(ref));
      const candidates = context.descendants.slice(0, PLAYLIST_LIMIT);
      const ids = new Set([root.id]);
      for (const parent of posts) {
        for (const post of candidates) {
          if (
            !ids.has(post.id) &&
            post.account.id === root.account.id &&
            post.in_reply_to_id &&
            post.in_reply_to_id === parent.id
          ) {
            posts.push(post);
            ids.add(post.id);
          }
        }
      }
    }
    await this.linked.ready(posts);
    const tracks = posts.flatMap((post) => this.player.tracks(post));
    const visited = new Set([url]);
    for (const post of posts) {
      const content = new DOMParser().parseFromString(post.content || '', 'text/html');
      for (const anchor of Array.from(content.querySelectorAll('a[href]')).slice(
        0,
        PLAYLIST_LIMIT,
      )) {
        const href = anchor.getAttribute('href')!;
        if (visited.has(href) || visited.size >= PLAYLIST_LIMIT) continue;
        visited.add(href);
        const linked = radioPostRef(href);
        if (linked) {
          try {
            tracks.push(...this.player.tracks(await firstValueFrom(this.api.getStatus(linked))));
          } catch {
            /* A deleted linked post does not discard the rest of the thread. */
          }
        } else if (!externalMedia(href) && !directAudioUrl(href) && !locItemIds(href).length) {
          tracks.push(
            ...this.fromUrl(href).map((track) => ({
              ...track,
              key: `${post.id}:${track.media.id}`,
              post: { ...post, media_attachments: [...post.media_attachments, track.media] },
            })),
          );
        }
      }
    }
    return tracks;
  }
  async importUrls(
    urls: string[],
    thread = false,
  ): Promise<{ tracks: RadioTrack[]; skipped: number }> {
    const tracks: RadioTrack[] = [];
    let skipped = Math.max(0, urls.length - PLAYLIST_LIMIT);
    for (const url of urls.slice(0, PLAYLIST_LIMIT)) {
      try {
        const items = radioPostRef(url)
          ? await this.importPost(url, thread)
          : await this.fromLink(url);
        if (!items.length) skipped++;
        tracks.push(...items);
      } catch {
        skipped++;
      }
    }
    const unique = new Map(tracks.map((track) => [track.key, track]));
    return { tracks: [...unique.values()].slice(0, PLAYLIST_LIMIT), skipped };
  }
  /** A pasted link: a file, a controllable provider or a Library of Congress item. */
  private async fromLink(raw: string): Promise<RadioTrack[]> {
    const tracks = this.fromUrl(raw);
    if (tracks.length) return tracks;
    const post = this.linkPost(raw);
    if (!post || !locItems(post).length) return [];
    await this.linked.ready([post]);
    return this.player.tracks(post);
  }
  private linkPost(raw: string): Status | null {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (url.protocol !== 'https:') return null;
    const href = url.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    return {
      id: url.href,
      url: url.href,
      visibility: 'public',
      account: { id: url.hostname, acct: url.hostname, display_name: url.hostname },
      content: `<a href="${href}">Audio</a>`,
      spoiler_text: '',
      sensitive: false,
      media_attachments: [],
    } as unknown as Status;
  }
  fromUrl(raw: string): RadioTrack[] {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return [];
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return [];
    const direct = directAudioUrl(url.href);
    const source = direct ? null : externalMedia(url.href);
    if (!direct && !(source?.type === 'audio' && source.controllable && source.embed)) return [];
    const post = {
      id: url.href,
      url: url.href,
      visibility: 'public',
      account: { id: url.hostname, acct: url.hostname, display_name: url.hostname },
      content: source
        ? '<a href="' +
          source.url.replaceAll('&', '&amp;').replaceAll('"', '&quot;') +
          '">Audio</a>'
        : '',
      spoiler_text: '',
      sensitive: false,
      media_attachments: direct ? [linkedAttachment(direct, fileTitle(direct), url.href)] : [],
    } as Status;
    return this.player.tracks(post);
  }
}
