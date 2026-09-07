import { MediaAttachment, Status } from '../../../models';

/**
 * One tile on the media wall: a single image, tied back to the post it came from.
 *
 * One tile per *image*, not per post — a four-photo album contributes four tiles,
 * which is what makes the grid read as a wall of pictures rather than a list of
 * posts. {@link postIndex} and {@link indexInPost} exist so the photo viewer can
 * offer both movements the grid implies: left/right through every image in order,
 * and up/down to the next post regardless of how many images the current one has.
 */
export interface ProfileMediaItem {
  /** `${status.id}.${indexInPost}` — the value carried in the `?photo=` param. */
  key: string;
  /** The post this image belongs to. */
  status: Status;
  /** Full-size source, shown in the viewer. */
  url: string;
  /** Smaller source for the grid, falling back to {@link url}. */
  previewUrl: string;
  /** Alt text, when the source supplied one. */
  description: string | null;
  /** `image`, `video` or `gifv` — video and gifv render a play badge. */
  type: 'image' | 'video' | 'gifv';
  /** Position of this image within its own post (0-based). */
  indexInPost: number;
  /** Position of the owning post within the media set (0-based, ascending). */
  postIndex: number;
}

/**
 * One image pulled out of a post, before it is placed on the wall.
 *
 * The wall-level fields (`key`, `status`, `postIndex`) are the caller's to fill:
 * extraction only knows about the picture, not where it lands in the grid.
 */
export type ExtractedMedia = Omit<ProfileMediaItem, 'key' | 'status' | 'postIndex'>;

/** Builds the `?photo=` key for a status/attachment pair. */
export function mediaKey(statusId: string, indexInPost: number): string {
  return `${statusId}.${indexInPost}`;
}

/**
 * File extensions we are willing to treat as a picture when scraping HTML.
 *
 * Deliberately a allowlist rather than a denylist of junk: a URL with no
 * extension at all is far more often a tracking beacon than a photo, so the
 * default answer for "is this an image?" should be no.
 */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gifv?|webp|avif|bmp|tiff?)(\?|#|$)/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/**
 * URL fragments that mark an image as chrome rather than content.
 *
 * Every entry here was chosen because it appears in the *path* of things RSS
 * feeds routinely embed and readers never want on a photo wall: analytics
 * beacons, share-button sprites, feed badges, avatars and emoji. This is the
 * "filter out junk aggressively" rule — a missed photo is a smaller failure
 * than a grid of tracking pixels and Feedburner icons.
 */
const JUNK_PATTERNS = [
  /pixel/i,
  /beacon/i,
  /track(ing|er)?[./_-]/i,
  /analytics/i,
  /\bstat(s|counter)?\b/i,
  /spacer/i,
  /blank\.(gif|png)/i,
  /transparent\.(gif|png)/i,
  /1x1/,
  /feedburner/i,
  /feedblitz/i,
  /gravatar/i,
  /avatar/i,
  /profile[._-]?(pic|image)/i,
  /\bicons?\b/i,
  /favicon/i,
  /logo/i,
  /badge/i,
  /button/i,
  /sprite/i,
  /emoji/i,
  /smiley/i,
  /share[._-]/i,
  /subscribe/i,
  /\bads?\b/i,
  /doubleclick/i,
];

/** Query/path hints that a URL is a deliberately tiny rendition. */
const TINY_HINTS = [
  /[?&](w|width)=([1-9]?\d)(&|$)/i,
  /[?&](h|height)=([1-9]?\d)(&|$)/i,
  /[?&]s=([1-9]?\d)(&|$)/i,
  /[_-](\d{1,2})x(\d{1,2})\./i,
];

/**
 * Whether a scraped URL is worth putting on the wall.
 *
 * Applied only to *scraped* images. Attachments declared by Mastodon and
 * Bluesky arrive through their own APIs already meaning "this is media the
 * author attached", and running them through this filter would drop legitimate
 * photos whose filename happens to contain "logo".
 */
export function looksLikePhoto(rawUrl: string): boolean {
  const url = rawUrl.trim();
  if (!url || url.startsWith('data:')) {
    // Data URIs are almost always inlined spacers and icons, and they cannot be
    // paged to a full-size version anyway.
    return false;
  }
  if (!/^https?:\/\//i.test(url) && !url.startsWith('//') && !url.startsWith('/')) {
    return false;
  }
  if (!IMAGE_EXTENSIONS.test(url) && !VIDEO_EXTENSIONS.test(url)) {
    return false;
  }
  if (JUNK_PATTERNS.some((pattern) => pattern.test(url))) {
    return false;
  }
  if (TINY_HINTS.some((pattern) => pattern.test(url))) {
    return false;
  }
  return true;
}

/** Classify a URL for rendering: video and gifv get a play badge. */
function mediaTypeFor(url: string): 'image' | 'video' | 'gifv' {
  if (VIDEO_EXTENSIONS.test(url)) {
    return 'video';
  }
  return /\.gifv(\?|#|$)/i.test(url) ? 'gifv' : 'image';
}

/**
 * The dimensions a scraped `<img>` declares, when it declares any.
 *
 * `width="1" height="1"` is the classic tracking pixel and is worth catching
 * before it ever reaches the grid. Absent attributes mean "unknown", which is
 * not the same as "small" — those are allowed through and re-checked once the
 * browser has actually loaded them (see `onLoadedSize` in the grid).
 */
function declaredSizeIsTiny(element: Element): boolean {
  const width = Number(element.getAttribute('width'));
  const height = Number(element.getAttribute('height'));
  if (Number.isFinite(width) && width > 0 && width < 100) {
    return true;
  }
  return Number.isFinite(height) && height > 0 && height < 100;
}

/**
 * Pull the images out of a status, whatever provider it came from.
 *
 * Three sources, in descending order of trust:
 *
 * 1. `media_attachments` — Mastodon and Bluesky both populate this through
 *    their adapters, and it is authoritative: the author attached these.
 * 2. The rendered HTML body — how RSS items and scraped Twitter posts carry
 *    their pictures. Filtered hard by {@link looksLikePhoto}, because feed HTML
 *    is full of beacons and share buttons.
 * 3. The preview card image — an og:image, used only when the post yielded
 *    nothing else, so a link post still shows the thing it is a link to.
 *
 * Deduplicated by URL: a feed that both attaches an image and repeats it in the
 * body should occupy one tile, not two.
 */
export function extractMedia(status: Status): ExtractedMedia[] {
  const found: ExtractedMedia[] = [];
  const seen = new Set<string>();

  const push = (
    url: string,
    previewUrl: string,
    description: string | null,
    type: ExtractedMedia['type'],
  ): void => {
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    found.push({
      url: normalized,
      previewUrl: previewUrl.trim() || normalized,
      description,
      type,
      indexInPost: found.length,
    });
  };

  for (const attachment of status.media_attachments ?? []) {
    if (!isVisualAttachment(attachment)) {
      continue;
    }
    push(
      attachment.url,
      attachment.preview_url || attachment.url,
      attachment.description,
      attachment.type === 'video' || attachment.type === 'gifv' ? attachment.type : 'image',
    );
  }

  for (const scraped of scrapeHtmlImages(status.content ?? '')) {
    push(scraped.url, scraped.url, scraped.description, mediaTypeFor(scraped.url));
  }

  // Only as a last resort: a card image is the *link's* picture, not the
  // author's, so it should never outrank something they actually posted.
  const cardImage = status.card?.image;
  if (!found.length && cardImage && looksLikePhoto(cardImage)) {
    push(cardImage, cardImage, status.card?.title ?? null, mediaTypeFor(cardImage));
  }

  return found;
}

/** Attachment types that belong on a photo wall (audio and unknown do not). */
function isVisualAttachment(attachment: MediaAttachment): boolean {
  return attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'gifv';
}

/**
 * Scrape `<img>` sources out of rendered post HTML.
 *
 * Uses `DOMParser` rather than a regex: post bodies are attacker-influenced
 * text, and parsing them as an inert document means nothing is executed and no
 * network request is made for the images found here. The parsed document is
 * never attached to the page.
 */
function scrapeHtmlImages(html: string): { url: string; description: string | null }[] {
  if (!html.includes('<img') && !html.includes('<video')) {
    return [];
  }
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return [];
  }
  const results: { url: string; description: string | null }[] = [];
  for (const element of Array.from(doc.querySelectorAll('img, video, source'))) {
    if (declaredSizeIsTiny(element)) {
      continue;
    }
    // `srcset` wins where present: feeds that offer one usually list a genuinely
    // large rendition there while `src` holds a thumbnail.
    const candidate =
      largestFromSrcset(element.getAttribute('srcset')) ||
      element.getAttribute('src') ||
      element.getAttribute('data-src') ||
      '';
    if (!looksLikePhoto(candidate)) {
      continue;
    }
    const alt = element.getAttribute('alt');
    results.push({ url: candidate, description: alt?.trim() ? alt.trim() : null });
  }
  return results;
}

/** Pick the widest entry from a `srcset`, or empty when there isn't one. */
function largestFromSrcset(srcset: string | null): string {
  if (!srcset) {
    return '';
  }
  let bestUrl = '';
  let bestWidth = -1;
  for (const entry of srcset.split(',')) {
    const [url, descriptor] = entry.trim().split(/\s+/);
    if (!url) {
      continue;
    }
    const width = descriptor?.endsWith('w') ? Number(descriptor.slice(0, -1)) : 0;
    if (width > bestWidth) {
      bestWidth = width;
      bestUrl = url;
    }
  }
  return bestUrl;
}

/**
 * Flatten a list of posts into the ordered media wall.
 *
 * Posts keep their timeline order and images keep their in-post order, so the
 * grid reads newest-first left-to-right and the viewer's left/right arrows walk
 * exactly the sequence the eye sees.
 */
export function buildMediaItems(statuses: Status[]): ProfileMediaItem[] {
  const items: ProfileMediaItem[] = [];
  let postIndex = 0;
  for (const status of statuses) {
    // Boosts are someone else's pictures. A profile's media tab is "photos this
    // person posted", so the reblog wrapper is skipped rather than unwrapped.
    if (status.reblog) {
      continue;
    }
    const extracted = extractMedia(status);
    if (!extracted.length) {
      continue;
    }
    for (const item of extracted) {
      items.push({
        ...item,
        key: mediaKey(status.id, item.indexInPost),
        status,
        postIndex,
      });
    }
    postIndex += 1;
  }
  return items;
}
