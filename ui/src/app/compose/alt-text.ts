import { MediaAttachment } from '../models';

/**
 * Whether an attachment of this kind is expected to carry a description.
 *
 * Mastodon accepts a description on any attachment, and screen readers use it
 * for all of them, so the honest answer is "all of them". The one exclusion is
 * `unknown`, which is what the server reports for a file it could not process:
 * nagging about a description for an attachment that may never publish is
 * noise, and the upload failure is the more useful thing to tell someone about.
 *
 * Kept as a named rule rather than an inline `type === 'image'` test because
 * the two composing surfaces disagreed about it. The compact composer asked for
 * a description on *every* attachment while the writing page asked only for
 * images, so the same video was nagged about in one surface and silently
 * accepted in the other.
 */
export function needsDescription(media: MediaAttachment): boolean {
  return media.type !== 'unknown';
}

/**
 * Mastodon's attachment kind for a local file, from its MIME type.
 *
 * The two composing surfaces classified local files differently — one
 * hardcoded `image` for everything, the other split the MIME type and never
 * produced `gifv` — so the same GIF was an image in one and a gifv in the
 * other. `unknown` matches what a server reports for a file it cannot place.
 */
export function mediaTypeOf(file: File): string {
  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/')) {
    return mime === 'image/gif' ? 'gifv' : 'image';
  }
  if (mime.startsWith('video/')) {
    return 'video';
  }
  if (mime.startsWith('audio/')) {
    return 'audio';
  }
  return 'unknown';
}

/** An attachment paired with the description the user has typed for it. */
export interface DescribableMedia {
  media: MediaAttachment;
  description: string;
}

/**
 * The attachments still missing a description, in attachment order.
 *
 * Returned as indexes rather than a bare count so a caller can point at the
 * specific box that needs filling in — "an image has no description" is a much
 * weaker message when four are attached.
 */
export function undescribedIndexes(items: readonly DescribableMedia[]): number[] {
  return items.flatMap((item, index) =>
    needsDescription(item.media) && !item.description.trim() ? [index] : [],
  );
}

/** Whether anything attached still needs a description. */
export function hasUndescribedMedia(items: readonly DescribableMedia[]): boolean {
  return undescribedIndexes(items).length > 0;
}

/**
 * What to tell someone about attachments with no description.
 *
 * `required` is the user's own opt-in to friction (Settings → Writing →
 * "Require alt text on every image before posting"). It changes the wording,
 * not the finding: with it off this is advice, and phrasing advice as a
 * prohibition is how a composer teaches people to ignore it.
 */
export function altTextMessage(indexes: readonly number[], required: boolean): string | null {
  if (!indexes.length) {
    return null;
  }
  const which =
    indexes.length === 1
      ? `Attachment ${indexes[0] + 1} has`
      : `${indexes.length} attachments have`;
  return required
    ? `${which} no description. Describe ${indexes.length === 1 ? 'it' : 'them'} before publishing.`
    : `${which} no description. Screen readers will skip ${indexes.length === 1 ? 'it' : 'them'}.`;
}
