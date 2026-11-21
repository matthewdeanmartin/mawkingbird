const URL_PATTERN = /https?:\/\/[^\s<]+/gi;

/** Punctuation that should not be treated as part of a trailing URL. */
const TRAILING_PUNCTUATION = /[.,;:!?'")\]}]+$/;

export interface PostUrl {
  /** The URL as it appears in the text, trailing punctuation removed. */
  url: string;
  /** Index of the first character of the URL within the text. */
  start: number;
  /** Index one past the last character. */
  end: number;
}

/** Every bare URL in `text`, in the order they appear. */
export function findUrls(text: string): PostUrl[] {
  const found: PostUrl[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const trimmed = raw.replace(TRAILING_PUNCTUATION, '');
    // A "URL" that is nothing but a scheme is not one.
    if (!/^https?:\/\/\S/i.test(trimmed)) {
      continue;
    }
    const start = match.index ?? 0;
    found.push({ url: trimmed, start, end: start + trimmed.length });
  }
  return found;
}

/** Count each recognized URL at the supplied width and all other text by Unicode code point. */
export function postLength(text: string, urlWeight: number): number {
  const urls = findUrls(text);
  if (!urls.length) {
    return Array.from(text).length;
  }

  let total = 0;
  let cursor = 0;
  for (const { start, end } of urls) {
    total += Array.from(text.slice(cursor, start)).length;
    total += urlWeight;
    cursor = end;
  }
  total += Array.from(text.slice(cursor)).length;
  return total;
}

/**
 * Chunk continuous prose to fit `limit`.
 *
 * Boundaries are preferred in descending order of how much the reader notices
 * them: paragraph break, then sentence end, then a space. Only when a single
 * unbroken run is itself over the limit does this cut mid-word, and even then it
 * will not cut inside a URL — a severed link is worse than an over-long post,
 * because the post is merely ugly while the link is broken.
 *
 * Measured with {@link postLength} throughout, so a paragraph of links chunks by
 * what the server will actually count rather than by how wide the text looks.
 */
export function autoSplit(text: string, options: { limit: number; urlWeight: number }): string[] {
  const limit = Math.max(1, options.limit);
  const urlWeight = options.urlWeight;
  const body = text.trim();

  const segments: string[] = [];
  let rest = body;
  while (rest) {
    if (postLength(rest, urlWeight) <= limit) {
      segments.push(rest);
      break;
    }
    const cut = findCut(rest, limit, urlWeight);
    segments.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return segments.filter((s) => s !== '');
}

/**
 * The index to cut `text` at so the head fits within `limit`.
 *
 * Always returns at least 1, so a caller looping on the remainder cannot spin
 * forever on a string it fails to shorten.
 */
function findCut(text: string, limit: number, urlWeight: number): number {
  // A URL is one indivisible unit even when its reserved width exceeds the limit.
  const urls = findUrls(text);
  let nextUrl = 0;
  let fits = 0;
  let length = 0;
  while (fits < text.length) {
    const url = urls[nextUrl];
    if (url?.start === fits) {
      if (length + urlWeight > limit) {
        if (fits === 0) return url.end;
        break;
      }
      fits = url.end;
      length += urlWeight;
      nextUrl++;
    } else {
      if (length + 1 > limit) break;
      fits += text.codePointAt(fits)! > 0xffff ? 2 : 1;
      length++;
    }
  }

  const head = text.slice(0, fits);
  const paragraph = head.lastIndexOf('\n\n');
  if (paragraph > 0) {
    return paragraph;
  }
  const sentence = lastSentenceEnd(head);
  if (sentence > 0) {
    return sentence;
  }
  const space = head.search(/\s+\S*$/);
  if (space > 0) {
    return space;
  }
  return Math.max(1, fits);
}

/** Index just past the last sentence-ending punctuation followed by a space. */
function lastSentenceEnd(text: string): number {
  let found = 0;
  for (const match of text.matchAll(/[.!?]["')\]]?\s/g)) {
    found = (match.index ?? 0) + match[0].length;
  }
  return found;
}
