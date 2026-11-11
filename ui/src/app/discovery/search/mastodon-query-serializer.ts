/**
 * Serializes the rich `PostSearchCriteria` into the full-text query string sent
 * to Mastodon's `GET /api/v2/search?type=statuses` (see `spec/search/better_search.md` §8).
 *
 * This is the single, dedicated place that knows the Mastodon query dialect.
 * There is intentionally no parser back from a query string into criteria — the
 * structured object is canonical and this output is a derived artifact.
 *
 * IMPORTANT (the DSL trust bet, sprint 2 doc): we emit the operators the
 * consultant says mastodon.social honors, without a live spike. If the server
 * silently ignores one, results come back *broader* than the criteria imply —
 * the Explain panel shows this verbatim string so a human can catch it, and the
 * tests below are the contract we re-point if reality bites.
 *
 * `contentType` is only partially server-side: `media` maps to `has:media`, but
 * finer distinctions (image/video/audio) and `text`/`link`/`poll` stay
 * loaded-result filters (§6.5) and are NOT emitted here.
 */

import { PostSearchCriteria } from './mawkingbird-search';

export interface MastodonQuerySerializer {
  serialize(criteria: PostSearchCriteria): string;
}

/** Split a free-text field into individual tokens on whitespace. */
function tokens(value: string | undefined): string[] {
  return (value ?? '').trim().split(/\s+/u).filter(Boolean);
}

/** A phrase becomes a quoted literal; embedded quotes are stripped (Mastodon has
 *  no phrase-escaping, so the safe move is to remove the quote characters). */
function quotePhrase(phrase: string): string {
  const cleaned = phrase.replace(/"/g, '').trim().replace(/\s+/gu, ' ');
  return cleaned ? `"${cleaned}"` : '';
}

/** Normalize a handle to `@user@server` (accepts it with or without the leading @). */
function normalizeAuthor(author: string): string {
  const trimmed = author.trim().replace(/\s+/g, '');
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

class DefaultMastodonQuerySerializer implements MastodonQuerySerializer {
  serialize(criteria: PostSearchCriteria): string {
    const parts: string[] = [];

    // 1. Free text: each "all of these words" token gets a leading + (AND).
    for (const word of tokens(criteria.words)) {
      parts.push(`+${word}`);
    }

    // 2. Exact phrase.
    if (criteria.exactPhrase) {
      const phrase = quotePhrase(criteria.exactPhrase);
      if (phrase) {
        parts.push(phrase);
      }
    }

    // 3. Excluded words: each gets a leading -.
    for (const word of tokens(criteria.excludeWords)) {
      parts.push(`-${word}`);
    }

    // 4. Author.
    if (criteria.author) {
      const handle = normalizeAuthor(criteria.author);
      if (handle) {
        parts.push(`from:${handle}`);
      }
    }

    // 5. Dates. `during` is a single day; otherwise before/after bounds.
    if (criteria.dates?.after) {
      parts.push(`after:${criteria.dates.after}`);
    }
    if (criteria.dates?.before) {
      parts.push(`before:${criteria.dates.before}`);
    }

    // 6. Language.
    if (criteria.language) {
      parts.push(`language:${criteria.language}`);
    }

    // 7. Content type: only `media` is server-side (has:media). Finer types are
    //    loaded-result filters and deliberately not emitted here.
    if (criteria.contentType === 'media') {
      parts.push('has:media');
    } else if (criteria.contentType === 'poll') {
      parts.push('has:poll');
    }

    // 8. Replies.
    if (criteria.replies === 'exclude') {
      parts.push('-is:reply');
    } else if (criteria.replies === 'only') {
      parts.push('is:reply');
    }

    // 9. Sensitive.
    if (criteria.sensitive === 'exclude') {
      parts.push('-is:sensitive');
    } else if (criteria.sensitive === 'only') {
      parts.push('is:sensitive');
    }

    // 10. Scope. `all` is the default and emits nothing.
    if (criteria.scope === 'public') {
      parts.push('in:public');
    } else if (criteria.scope === 'library') {
      parts.push('in:library');
    }

    return parts.join(' ');
  }
}

export const mastodonQuerySerializer: MastodonQuerySerializer =
  new DefaultMastodonQuerySerializer();

/** Convenience free function mirroring the serializer's single method. */
export function serializeMastodonQuery(criteria: PostSearchCriteria): string {
  return mastodonQuerySerializer.serialize(criteria);
}
