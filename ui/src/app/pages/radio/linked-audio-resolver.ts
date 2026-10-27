import { Injectable, signal } from '@angular/core';
import { AudioTags, readId3, TAG_BYTES } from '../../audio-embeds/id3';
import { linkedAttachment, linkedAudio, locItems } from '../../audio-embeds/linked-audio';
import { MediaAttachment, Status } from '../../models';

const CACHE_LIMIT = 500;
const CONCURRENCY = 2;

function remember<T>(map: ReadonlyMap<string, T>, key: string, value: T): Map<string, T> {
  const next = new Map(map);
  next.delete(key);
  next.set(key, value);
  while (next.size > CACHE_LIMIT) next.delete(next.keys().next().value!);
  return next;
}

/**
 * Turns links into playable audio for Radio. Requests go straight to the public,
 * CORS-enabled origin without credentials or a referrer. Media bytes are never
 * proxied: playback uses the audio element, and tag reads are one small range.
 */
@Injectable({ providedIn: 'root' })
export class LinkedAudioResolver {
  private readonly loc = signal<ReadonlyMap<string, MediaAttachment[] | null>>(new Map());
  private readonly tagged = signal<ReadonlyMap<string, AudioTags | null>>(new Map());
  private readonly queued: string[] = [];
  private readonly pending = new Set<string>();
  private readonly waiting = new Map<string, Promise<void>>();
  private readonly settle = new Map<string, () => void>();
  private active = 0;

  /** Whether a post links to audio this resolver can make playable. */
  candidate(post: Status): boolean {
    return linkedAudio(post).length > 0 || locItems(post).length > 0;
  }

  /** Playable linked files: direct ones now, Library of Congress items once resolved. */
  attachments(post: Status): MediaAttachment[] {
    const loc = this.loc();
    return [
      ...linkedAudio(post).map((item) => item.media),
      ...locItems(post).flatMap((id) => loc.get(id) ?? []),
    ];
  }

  /** Look up unresolved Library of Congress items, a few at a time. */
  resolve(posts: readonly Status[]): void {
    const known = this.loc();
    for (const id of posts.flatMap(locItems))
      if (!known.has(id) && !this.pending.has(id)) {
        this.pending.add(id);
        this.queued.push(id);
        this.waiting.set(id, new Promise((done) => this.settle.set(id, done)));
      }
    this.pump();
  }

  /** Resolve the posts' Library of Congress items and wait for the results. */
  async ready(posts: readonly Status[]): Promise<void> {
    this.resolve(posts);
    await Promise.all(posts.flatMap(locItems).map((id) => this.waiting.get(id)));
  }

  tags(url: string): AudioTags | undefined {
    return this.tagged().get(url) ?? undefined;
  }

  /** Read an MP3's ID3 title once, where its host allows cross-origin reads. */
  readTags(url: string): void {
    if (this.tagged().has(url) || this.pending.has(url) || !/^https:\/\//i.test(url)) return;
    if (!/\.mp3(?:[?#]|$)/i.test(new URL(url).pathname)) return;
    this.pending.add(url);
    void fetch(url, {
      headers: { Range: `bytes=0-${TAG_BYTES - 1}` },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15_000),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        // A server ignoring Range would send the whole file; read only the start.
        const reader = response.body?.getReader();
        if (!reader) return null;
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (length < TAG_BYTES) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          length += value.length;
        }
        void reader.cancel().catch(() => undefined);
        const bytes = new Uint8Array(Math.min(length, TAG_BYTES));
        let at = 0;
        for (const chunk of chunks) {
          const part = chunk.subarray(0, bytes.length - at);
          bytes.set(part, at);
          at += part.length;
          if (at >= bytes.length) break;
        }
        const tags = readId3(bytes);
        return tags.title || tags.artist ? tags : null;
      })
      .catch(() => null)
      .then((tags) => {
        this.pending.delete(url);
        this.tagged.update((map) => remember(map, url, tags));
      });
  }

  private pump(): void {
    while (this.active < CONCURRENCY && this.queued.length) {
      const id = this.queued.shift()!;
      this.active++;
      void this.fetchItem(id)
        .catch(() => null)
        .then((media) => {
          this.active--;
          this.pending.delete(id);
          this.loc.update((map) => remember(map, id, media));
          this.settle.get(id)?.();
          this.settle.delete(id);
          this.waiting.delete(id);
          this.pump();
        });
    }
  }

  private async fetchItem(id: string): Promise<MediaAttachment[] | null> {
    const response = await fetch(
      `https://www.loc.gov/item/${encodeURIComponent(id)}/?fo=json&at=item,resources`,
      { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      item?: { title?: unknown; contributor_names?: unknown };
      resources?: { audio?: unknown }[];
    };
    const title = typeof data.item?.title === 'string' ? data.item.title.trim() : '';
    const names = Array.isArray(data.item?.contributor_names) ? data.item.contributor_names : [];
    const artist = typeof names[0] === 'string' ? names[0].split(' -- ')[0].trim() : '';
    const files = (data.resources ?? [])
      .map((resource) => resource?.audio)
      .filter((audio): audio is string => {
        if (typeof audio !== 'string') return false;
        try {
          const url = new URL(audio);
          return url.protocol === 'https:' && url.hostname === 'tile.loc.gov';
        } catch {
          return false;
        }
      })
      .slice(0, 20);
    const label = [title, artist].filter(Boolean).join(' — ').slice(0, 200);
    return files.length
      ? files.map((url, index) =>
          linkedAttachment(
            url,
            files.length > 1 ? `${label} (${index + 1})` : label,
            `loc:${id}:${index}`,
          ),
        )
      : null;
  }
}
