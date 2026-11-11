/**
 * How long a post is *as Mastodon counts it*, which is not how long the string
 * is.
 *
 * ## The bug this exists to fix
 *
 * Mastodon replaces every URL with a fixed-width placeholder before counting,
 * so a link costs the same whether it is `https://a.co` or a 700-character
 * Amazon URL carrying a `dib=` tracking blob. The server advertises the width as
 * `configuration.statuses.characters_reserved_per_url` (23 on mastodon.social,
 * and 23 everywhere else in practice — it is Twitter's old t.co width, inherited).
 *
 * Counting `text.length` instead meant the composer refused to post things the
 * server would have accepted without complaint: paste one ordinary Amazon
 * product link and a two-line post appeared to be 700 characters over budget.
 * The user is told to "shorten it" when there is nothing to shorten.
 *
 * ## What counts as a URL
 *
 * Deliberately close to Mastodon's own extractor and deliberately *not* a
 * general-purpose URL regex. Mastodon linkifies bare `http://` and `https://`
 * runs; it does not linkify `www.example.com` or `example.com`, so neither does
 * this — over-counting a plain domain as 23 would swing the error the other way
 * and let a genuinely-too-long post through to a server rejection.
 *
 * Trailing punctuation is excluded from the URL, because a sentence ending
 * "…see https://example.com/page." should not swallow the full stop into the
 * link. This mirrors what Mastodon's linkifier does when it renders the post.
 */

/** The width Mastodon reserves for any URL. Overridable per instance. */
export const DEFAULT_URL_WEIGHT = 23;

/**
 * Bare URLs in a post body.
 *
 * The trailing-character class excludes the punctuation that usually ends a
 * sentence rather than a URL. Parentheses are excluded too, which is imperfect
 * — a Wikipedia link ending in `_(disambiguation)` loses its closing bracket —
 * but the cost is one character of count, never a broken link, because this is
 * only ever used for *measuring*.
 */
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

/**
 * The post's length as the server will measure it.
 *
 * Uses `Array.from` rather than `.length` for the non-URL remainder so that an
 * emoji or any other astral-plane character counts as one, matching Ruby's
 * grapheme-ish counting rather than JavaScript's UTF-16 code units. Getting this
 * wrong is the same class of bug as the URL one, just rarer and smaller.
 */
export function postLength(text: string, urlWeight: number = DEFAULT_URL_WEIGHT): number {
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
 * How many characters shortening every long URL would save.
 *
 * Zero when there is nothing to gain, which is the common case and is why the
 * composer's shorten affordance stays out of the way until it would help: a URL
 * already at or under the reserved width costs the same shortened, so offering
 * to shorten it is busywork that spends a link from the user's monthly quota.
 *
 * Note this is about the *displayed* text, not the count. A 700-character URL
 * already costs only 23 against the limit — the reason to shorten it is that it
 * looks awful in the box and in the post, not that it saves budget.
 */
export function longUrls(text: string, urlWeight: number = DEFAULT_URL_WEIGHT): PostUrl[] {
  return findUrls(text).filter((entry) => Array.from(entry.url).length > urlWeight);
}
