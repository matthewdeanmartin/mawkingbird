import { MediaAttachment, ProviderId, Status } from '../models';
import { extractMedia } from '../pages/profile/media/profile-media-item';

/**
 * Pulling a post's or profile's attachments into the browser as bytes, for a zip
 * or a run of individual downloads.
 *
 * ## Why some files can't be fetched
 *
 * `fetch().blob()` on another server's file needs that server to send
 * `Access-Control-Allow-Origin`. Most Mastodon media hosts do (mastodon.social,
 * hachyderm, fosstodon, masto.host…); some don't (universeodon's Cloudflare,
 * several self-hosted nginx setups). A probe of ~20 hosts on 2026-10-31 found
 * roughly three in four working. `mode: 'no-cors'` is no escape — it yields an
 * opaque, zero-byte body.
 *
 * Mastodon serves remote media from the *viewer's* server cache, so `url` mostly
 * names one host and its CORS policy decides nearly everything. `remote_url`, the
 * origin server's copy, is tried second and rescued about half the failures in
 * the probe. Whatever still fails is handed back as a link for the reader to open
 * themselves. The Mawkingbird Plus proxy is deliberately not used: media bytes
 * through it cost the owner bandwidth.
 */

export type DownloadMediaType = 'image' | 'gifv' | 'video' | 'audio';

export const DOWNLOAD_MEDIA_TYPES: readonly DownloadMediaType[] = [
  'image',
  'gifv',
  'video',
  'audio',
];

export interface DownloadOptions {
  types: ReadonlySet<DownloadMediaType>;
  skipSensitive: boolean;
  includeBoosts: boolean;
}

/** One file to fetch, with the URLs to try in order. */
export interface DownloadItem {
  type: DownloadMediaType;
  /** `url` first, then `remote_url` when it differs. */
  candidates: string[];
  filename: string;
  /** The post the file came from, for the failure list. */
  postUrl: string | null;
}

export interface FetchedMedia {
  item: DownloadItem;
  blob: Blob;
}

/** Whether a post (or the post it boosts) is marked sensitive or carries a CW. */
export function isSensitive(status: Status): boolean {
  const shown = status.reblog ?? status;
  return !!shown.sensitive || !!shown.spoiler_text;
}

/**
 * Every downloadable file in these posts that passes the options, deduplicated
 * by URL so a post seen twice (a boost and its original) is fetched once.
 */
export function collectMedia(
  statuses: readonly Status[],
  options: DownloadOptions,
): DownloadItem[] {
  const seen = new Set<string>();
  const items: DownloadItem[] = [];
  for (const status of statuses) {
    if (status.reblog && !options.includeBoosts) continue;
    if (options.skipSensitive && isSensitive(status)) continue;
    const shown = status.reblog ?? status;
    sources(shown).forEach((source, index) => {
      if (!options.types.has(source.type) || seen.has(source.candidates[0])) return;
      seen.add(source.candidates[0]);
      items.push({
        ...source,
        filename: filenameFor(shown, index, source.candidates[0], source.type),
        postUrl: shown.url ?? null,
      });
    });
  }
  return items;
}

/** Does this post have anything the dialog could download? */
export function hasDownloadableMedia(status: Status): boolean {
  return sources(status.reblog ?? status).length > 0;
}

type Source = Pick<DownloadItem, 'type' | 'candidates'>;

const SCRAPED = new Set<ProviderId>(['rss', 'twitter', 'blog']);

function sources(status: Status): Source[] {
  const attachments = (status.media_attachments ?? []).flatMap(fromAttachment);
  // RSS and Twitter posts carry pictures in their bodies, not as attachments.
  // Elsewhere the scrape would only add link-preview images, which aren't the
  // post's own media.
  if (attachments.length || !SCRAPED.has(status.provider ?? 'mastodon')) return attachments;
  return extractMedia(status).map((media) => ({ type: media.type, candidates: [media.url] }));
}

function fromAttachment(media: MediaAttachment): Source[] {
  const type = media.type as DownloadMediaType;
  if (!DOWNLOAD_MEDIA_TYPES.includes(type) || !media.url) return [];
  const candidates = [media.url];
  if (media.remote_url && media.remote_url !== media.url) candidates.push(media.remote_url);
  return [{ type, candidates }];
}

const EXTENSION = /\.([a-z0-9]{2,5})(?:[?#]|$)/i;
const FALLBACK_EXTENSION: Record<DownloadMediaType, string> = {
  image: 'jpg',
  gifv: 'mp4',
  video: 'mp4',
  audio: 'mp3',
};

/** `handle-2026-10-31-postid-1.jpg`: sorts by author then date in a file manager. */
export function filenameFor(
  status: Status,
  index: number,
  url: string,
  type: DownloadMediaType,
): string {
  const safe = (text: string) => text.replace(/[^a-z0-9_-]+/gi, '_').slice(-40);
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Not absolute; match on the raw string.
  }
  const extension = EXTENSION.exec(path)?.[1]?.toLowerCase() ?? FALLBACK_EXTENSION[type];
  const date = (status.created_at ?? '').slice(0, 10) || 'undated';
  const author = safe(status.account?.acct ?? 'unknown');
  // Posts read anonymously carry a namespaced id; the server's own id is shorter.
  const ref = status.providerRef as { statusId?: unknown } | undefined;
  const id = typeof ref?.statusId === 'string' ? ref.statusId : status.id;
  return `${author}-${date}-${safe(id)}-${index + 1}.${extension}`;
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * Fetch one file, trying each candidate URL.
 *
 * A CORS refusal surfaces as a `TypeError` with no detail, and every file on
 * that host will refuse the same way, so the host is remembered in `blocked` and
 * skipped for the rest of the run. Returns null when no candidate worked.
 */
export async function fetchMedia(
  item: DownloadItem,
  blocked: Set<string>,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<FetchedMedia | null> {
  for (const url of item.candidates) {
    signal?.throwIfAborted();
    const origin = host(url);
    if (blocked.has(origin)) continue;
    try {
      const response = await fetcher(url, { mode: 'cors', credentials: 'omit', signal });
      if (!response.ok) continue;
      return { item, blob: await response.blob() };
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof TypeError) blocked.add(origin);
    }
  }
  return null;
}

/**
 * Run `task` over `items` with at most `limit` in flight, in input order.
 * Four keeps a single media host from seeing a burst while still overlapping
 * the round trips.
 */
export async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Bundle files into one zip. Stored, not compressed: JPEG, PNG and MP4 are
 * already compressed, so deflate would only burn CPU. fflate loads on demand so
 * it stays out of the initial bundle.
 */
export async function zipFiles(files: readonly FetchedMedia[]): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (const { item, blob } of files) {
    entries[uniqueName(item.filename, entries)] = new Uint8Array(await blob.arrayBuffer());
  }
  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}

function uniqueName(name: string, taken: Record<string, unknown>): string {
  if (!(name in taken)) return name;
  const dot = name.lastIndexOf('.');
  for (let n = 2; ; n++) {
    const candidate = `${name.slice(0, dot)}~${n}${name.slice(dot)}`;
    if (!(candidate in taken)) return candidate;
  }
}

/** Hand a blob to the browser as a download. */
export function saveBlob(blob: Blob, filename: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoking at once can cancel the download in some browsers; give it a moment.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
