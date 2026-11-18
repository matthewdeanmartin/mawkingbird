import { listZipEntries, readZipEntry, ZipEntry } from './archive-zip';
import type { PickedFile } from './unbird-archive';

/**
 * Photos and videos from the archive the reader picked this visit.
 *
 * Media is never copied into storage: it is read from the original .zip (or
 * unzipped folder) when a post or profile needs it. After a reload the reader
 * picks the archive again to include media; without it, posts go out as text.
 *
 * Twitter names a tweet's media `data/tweets_media/<tweet id>-<name>` and the
 * profile images `data/profile_media/<account id>-<name>`.
 */

/** Mastodon's usual limits; bigger files are skipped rather than refused mid-post. */
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_VIDEO_BYTES = 99 * 1024 * 1024;

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
};

interface MediaSource {
  name: string;
  size: number;
  read: () => Promise<Blob>;
}

const indexes = new WeakMap<readonly PickedFile[], Promise<MediaSource[]>>();

function folder(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : '';
}

function baseName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? '';
}

/** Every media file in the picked archive, listed once per pick. */
function mediaIndex(picked: readonly PickedFile[]): Promise<MediaSource[]> {
  let index = indexes.get(picked);
  if (!index) {
    index = (async () => {
      const sources: MediaSource[] = [];
      for (const file of picked) {
        if (file.path.toLowerCase().endsWith('.zip')) {
          for (const entry of await listZipEntries(file.blob)) {
            if (!/^(tweets|profile)_media$/.test(folder(entry.name))) continue;
            sources.push(zipSource(file.blob, entry));
          }
        } else if (/^(tweets|profile)_media$/.test(folder(file.path))) {
          sources.push({ name: file.path, size: file.blob.size, read: async () => file.blob });
        }
      }
      return sources;
    })();
    indexes.set(picked, index);
  }
  return index;
}

function zipSource(blob: Blob, entry: ZipEntry): MediaSource {
  return {
    name: entry.name,
    size: entry.size,
    read: async () => new Blob([(await readZipEntry(blob, entry)) as BlobPart]),
  };
}

function typeOf(name: string): string | null {
  return TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

async function asFile(source: MediaSource): Promise<File | null> {
  const type = typeOf(source.name);
  if (!type) return null;
  const limit = type.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (source.size > limit) return null;
  return new File([await source.read()], baseName(source.name), { type });
}

/** A tweet's attachments, in name order, at most four (Mastodon's limit). */
export async function tweetMedia(picked: readonly PickedFile[], tweetId: string): Promise<File[]> {
  const prefix = `${tweetId}-`;
  const sources = (await mediaIndex(picked))
    .filter((source) => folder(source.name) === 'tweets_media')
    .filter((source) => baseName(source.name).startsWith(prefix))
    .sort((left, right) => left.name.localeCompare(right.name));
  const files: File[] = [];
  for (const source of sources) {
    const file = await asFile(source);
    if (file) files.push(file);
    if (files.length === 4) break;
  }
  return files;
}

/**
 * A profile image by the file name at the end of Twitter's URL, for example
 * `…/profile_images/1/abc_400x400.jpg` → `<id>-abc_400x400.jpg`.
 */
export async function profileImage(
  picked: readonly PickedFile[],
  twitterUrl: string | undefined,
): Promise<File | null> {
  const wanted = twitterUrl?.split(/[?#]/)[0].split('/').pop();
  if (!wanted) return null;
  const source = (await mediaIndex(picked)).find(
    (item) =>
      folder(item.name) === 'profile_media' &&
      (baseName(item.name).endsWith(`-${wanted}`) ||
        baseName(item.name)
          .replace(/\.\w+$/, '')
          .endsWith(`-${wanted}`)),
  );
  return source ? asFile(source) : null;
}
