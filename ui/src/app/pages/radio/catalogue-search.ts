import { inject, Injectable } from '@angular/core';
import { linkedAttachment } from '../../audio-embeds/linked-audio';
import { Status } from '../../models';
import { LinkedAudioResolver } from './linked-audio-resolver';
import { RadioPlayer, RadioTrack } from './radio-player';

export type CatalogueSource = 'loc' | 'archive';
export const CATALOGUE_SOURCES: readonly CatalogueSource[] = ['loc', 'archive'];
const PAGE_SIZE = 20;
const FILE_LIMIT = 30;

/** One search result: a catalogue item that may hold one recording or many. */
export interface CatalogueItem {
  key: string;
  source: CatalogueSource;
  /** LoC item id or Internet Archive identifier. */
  id: string;
  title: string;
  creator: string;
  date: string;
  /** The item's public page, which is what gets shared and published. */
  page: string;
  image: string;
  rights: string;
}

/** The synthetic posts that carry catalogue recordings use this id prefix. */
export const CATALOGUE_POST = 'catalogue:';

function text(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}
function https(value: unknown): string {
  const raw = text(value).replace(/^http:\/\/www\.loc\.gov\//, 'https://www.loc.gov/');
  try {
    return new URL(raw).protocol === 'https:' ? raw : '';
  } catch {
    return '';
  }
}
function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Catalogue request failed: ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Searches public audio catalogues straight from the browser: both APIs send
 * `Access-Control-Allow-Origin: *`, and no credentials, referrer or proxy are
 * involved. Results become ordinary Radio tracks on synthetic posts, so they
 * play, queue, save and publish like any other recording.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueSearch {
  private readonly player = inject(RadioPlayer);
  private readonly linked = inject(LinkedAudioResolver);

  async search(
    source: CatalogueSource,
    query: string,
    page = 1,
  ): Promise<{ items: CatalogueItem[]; more: boolean }> {
    const q = query.trim().slice(0, 200);
    if (!q) return { items: [], more: false };
    return source === 'loc' ? this.searchLoc(q, page) : this.searchArchive(q, page);
  }

  /** The recordings an item holds, resolved to playable files. */
  async tracks(item: CatalogueItem): Promise<RadioTrack[]> {
    if (item.source === 'loc') {
      const post = this.post(item, []);
      await this.linked.ready([post]);
      return this.player.tracks(post);
    }
    const data = await json<{
      result?: { name?: unknown; format?: unknown; title?: unknown; source?: unknown }[];
    }>(`https://archive.org/metadata/${encodeURIComponent(item.id)}/files`);
    const files = (data.result ?? []).filter(
      (file) =>
        typeof file.name === 'string' &&
        /mp3/i.test(text(file.format)) &&
        // Archive derives low-bitrate copies of each upload; keep one copy per recording.
        !/_64kb\.mp3$|_vbr\.mp3$/i.test(file.name),
    );
    const media = files.slice(0, FILE_LIMIT).map((file) => {
      const name = file.name as string;
      const url = `https://archive.org/download/${encodeURIComponent(item.id)}/${name
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
      const title = text(file.title) || name.replace(/\.mp3$/i, '').replace(/[_]+/g, ' ');
      return linkedAttachment(url, files.length > 1 ? title : item.title, `ia:${item.id}/${name}`);
    });
    return this.player.tracks(this.post(item, media));
  }

  private post(item: CatalogueItem, media: ReturnType<typeof linkedAttachment>[]): Status {
    const label = item.source === 'loc' ? 'Library of Congress' : 'Internet Archive';
    return {
      id: `${CATALOGUE_POST}${item.page}`,
      url: item.page,
      uri: item.page,
      visibility: 'public',
      created_at: new Date(0).toISOString(),
      account: {
        id: item.source,
        acct: item.source === 'loc' ? 'loc.gov' : 'archive.org',
        display_name: item.creator || label,
        username: item.source,
      },
      content: `<p>${escape(item.title)}</p><p><a href="${escape(item.page)}">${escape(item.page)}</a></p>`,
      spoiler_text: '',
      sensitive: false,
      media_attachments: media,
    } as unknown as Status;
  }

  private async searchLoc(q: string, page: number) {
    const data = await json<{
      results?: Record<string, unknown>[];
      pagination?: { next?: unknown };
    }>(
      `https://www.loc.gov/audio/?q=${encodeURIComponent(q)}&fo=json&c=${PAGE_SIZE}&sp=${page}` +
        `&fa=online-format:audio&at=results,pagination`,
    );
    const items = (data.results ?? []).flatMap((row): CatalogueItem[] => {
      const page = https(row['url']);
      const id = /^https:\/\/www\.loc\.gov\/item\/(.+?)\/?$/.exec(page)?.[1];
      if (!id) return [];
      return [
        {
          key: `loc:${id}`,
          source: 'loc',
          id,
          title: text(row['title']) || id,
          creator: text(row['contributor']),
          date: text(row['date']),
          page: `https://www.loc.gov/item/${id}/`,
          image: https(row['image_url']),
          rights: text(row['rights']),
        },
      ];
    });
    return { items, more: !!data.pagination?.next };
  }

  private async searchArchive(q: string, page: number) {
    const fields = ['identifier', 'title', 'creator', 'date', 'licenseurl']
      .map((field) => `fl[]=${field}`)
      .join('&');
    const data = await json<{
      response?: { numFound?: number; docs?: Record<string, unknown>[] };
    }>(
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${q}) AND mediatype:audio`)}` +
        `&${fields}&rows=${PAGE_SIZE}&page=${page}&output=json`,
    );
    const docs = data.response?.docs ?? [];
    const items = docs.flatMap((doc): CatalogueItem[] => {
      const id = text(doc['identifier']);
      if (!/^[\w.-]+$/.test(id)) return [];
      return [
        {
          key: `archive:${id}`,
          source: 'archive',
          id,
          title: text(doc['title']) || id,
          creator: text(doc['creator']),
          date: text(doc['date']).slice(0, 10),
          page: `https://archive.org/details/${id}`,
          image: `https://archive.org/services/img/${id}`,
          rights: https(doc['licenseurl']),
        },
      ];
    });
    return { items, more: page * PAGE_SIZE < (data.response?.numFound ?? 0) };
  }
}
