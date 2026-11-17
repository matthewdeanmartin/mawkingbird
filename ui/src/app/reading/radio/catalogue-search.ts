import { inject, Injectable } from '@angular/core';
import { linkedAttachment } from '../audio-embeds/linked-audio';
import { Status } from '../../platform/api/models';
import { LinkedAudioResolver } from './linked-audio-resolver';
import { RadioPlayer, RadioTrack } from './radio-player';

export type CatalogueSource = 'loc' | 'archive' | 'openverse' | 'audius' | 'commons';
export const CATALOGUE_SOURCES: readonly CatalogueSource[] = [
  'loc',
  'archive',
  'openverse',
  'audius',
  'commons',
];
/** Audius asks each client to name itself; this names the app, never the listener. */
const AUDIUS_APP = 'mawkingbird';
const LABELS: Record<CatalogueSource, { label: string; acct: string }> = {
  loc: { label: 'Library of Congress', acct: 'loc.gov' },
  archive: { label: 'Internet Archive', acct: 'archive.org' },
  openverse: { label: 'Openverse', acct: 'openverse.org' },
  audius: { label: 'Audius', acct: 'audius.co' },
  commons: { label: 'Wikimedia Commons', acct: 'commons.wikimedia.org' },
};
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
  /** A playable file the search already returned (Openverse, Audius, Commons). */
  file?: string;
}

/** The synthetic posts that carry catalogue recordings use this id prefix. */
export const CATALOGUE_POST = 'catalogue:';

function text(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}
/** An https URL, whole: file names on Commons run long, so no text length cap applies. */
function https(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string' || first.length > 2000) return '';
  const raw = first.trim().replace(/^http:\/\/www\.loc\.gov\//, 'https://www.loc.gov/');
  try {
    return new URL(raw).protocol === 'https:' ? raw : '';
  } catch {
    return '';
  }
}
/** Plain text from catalogue metadata that may carry markup (Commons artist credits). */
function plain(value: unknown): string {
  return text(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .trim();
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
 * Searches public audio catalogues straight from the browser: every API here
 * sends `Access-Control-Allow-Origin: *` (probed 2026-11-16), and no
 * credentials, referrer or proxy are involved. Results become ordinary Radio tracks on synthetic posts, so they
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
    switch (source) {
      case 'loc':
        return this.searchLoc(q, page);
      case 'openverse':
        return this.searchOpenverse(q, page);
      case 'audius':
        return this.searchAudius(q, page);
      case 'commons':
        return this.searchCommons(q, page);
      default:
        return this.searchArchive(q, page);
    }
  }

  /** The recordings an item holds, resolved to playable files. */
  async tracks(item: CatalogueItem): Promise<RadioTrack[]> {
    if (item.file)
      return this.player.tracks(
        this.post(item, [linkedAttachment(item.file, item.title, `${item.source}:${item.id}`)]),
      );
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
    const { label, acct } = LABELS[item.source];
    return {
      id: `${CATALOGUE_POST}${item.page}`,
      url: item.page,
      uri: item.page,
      visibility: 'public',
      created_at: new Date(0).toISOString(),
      account: {
        id: item.source,
        acct,
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

  /** Openverse gathers openly licensed audio (Jamendo, Freesound, Wikimedia…) with direct files. */
  private async searchOpenverse(q: string, page: number) {
    const data = await json<{ page_count?: number; results?: Record<string, unknown>[] }>(
      `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&page_size=${PAGE_SIZE}&page=${page}`,
    );
    const items = (data.results ?? []).flatMap((row): CatalogueItem[] => {
      const id = text(row['id']);
      const file = https(row['url']);
      const landing = https(row['foreign_landing_url']);
      // Some results name no file; they can't play here.
      if (!/^[\w-]+$/.test(id) || !file || !landing) return [];
      const licence = [text(row['license']).toUpperCase(), text(row['license_version'])]
        .filter(Boolean)
        .join(' ');
      return [
        {
          key: `openverse:${id}`,
          source: 'openverse',
          id,
          title: text(row['title']) || id,
          creator: text(row['creator']),
          date: '',
          page: landing,
          image: https(row['thumbnail']),
          rights: https(row['license_url']) || (licence ? `CC ${licence}` : ''),
          file,
        },
      ];
    });
    return { items, more: page < (data.page_count ?? 0) };
  }

  /** Audius: independent artists streaming their own music. */
  private async searchAudius(q: string, page: number) {
    const data = await json<{ data?: Record<string, unknown>[] }>(
      `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}` +
        `&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}&app_name=${AUDIUS_APP}`,
    );
    const rows = data.data ?? [];
    const items = rows.flatMap((row): CatalogueItem[] => {
      const id = text(row['id']);
      const permalink = text(row['permalink']);
      if (!/^\w+$/.test(id) || !permalink.startsWith('/') || row['is_streamable'] === false)
        return [];
      const user = (row['user'] ?? {}) as Record<string, unknown>;
      const artwork = (row['artwork'] ?? {}) as Record<string, unknown>;
      return [
        {
          key: `audius:${id}`,
          source: 'audius',
          id,
          title: text(row['title']) || id,
          creator: text(user['name']),
          date: text(row['release_date']).slice(0, 10),
          page: `https://audius.co${permalink}`,
          image: https(artwork['150x150']),
          rights: '',
          file: `https://api.audius.co/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${AUDIUS_APP}`,
        },
      ];
    });
    return { items, more: rows.length === PAGE_SIZE };
  }

  /** Wikimedia Commons audio files, with their licence, in one request. */
  private async searchCommons(q: string, page: number) {
    const data = await json<{
      continue?: { gsroffset?: number };
      query?: { pages?: Record<string, Record<string, unknown>> };
    }>(
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
        `&generator=search&gsrsearch=${encodeURIComponent(`${q} filetype:audio`)}` +
        `&gsrnamespace=6&gsrlimit=${PAGE_SIZE}&gsroffset=${(page - 1) * PAGE_SIZE}` +
        '&prop=imageinfo&iiprop=url%7Cextmetadata' +
        '&iiextmetadatafilter=LicenseShortName%7CArtist%7CDateTimeOriginal',
    );
    const pages = Object.values(data.query?.pages ?? {}).sort(
      (a, b) => Number(a['index'] ?? 0) - Number(b['index'] ?? 0),
    );
    const items = pages.flatMap((row): CatalogueItem[] => {
      const info = (row['imageinfo'] as Record<string, unknown>[] | undefined)?.[0] ?? {};
      const meta = (info['extmetadata'] ?? {}) as Record<string, { value?: unknown }>;
      const file = https(String(info['url'] ?? '').replace(/\?.*$/, ''));
      const landing = https(info['descriptionurl']);
      // The whole file name identifies it; a cut-off one would match a different file.
      const title = typeof row['title'] === 'string' ? row['title'].replace(/^File:/, '') : '';
      if (!file || !landing || !title) return [];
      return [
        {
          key: `commons:${title}`,
          source: 'commons',
          id: title,
          title: text(title.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ')),
          creator: plain(meta['Artist']?.value),
          date: text(meta['DateTimeOriginal']?.value).slice(0, 10),
          page: landing,
          image: '',
          rights: text(meta['LicenseShortName']?.value),
          file,
        },
      ];
    });
    return { items, more: data.continue?.gsroffset !== undefined };
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
