/**
 * The Bluesky search dialect, in both directions.
 *
 * Unlike `mastodon-query-serializer.ts` — which is deliberately one-way, because
 * there the structured object is canonical — this file parses *and* serializes.
 * The reason is that Bluesky's operators are a real, documented, user-facing
 * syntax that people already type into bsky.app's own search box, so the query
 * string is an input the reader supplies, not just an artifact we emit. A reader
 * pasting `from:pfrazee since:2026-01-01 angular` must get the same search as a
 * reader who filled the Advanced form in, and the AI helper emits this syntax
 * too — its output has to land in the form.
 *
 * Operator set per https://www.bskysrch.com/bluesky-search-operators, restricted
 * to the ones `app.bsky.feed.searchPosts` actually takes as parameters (see
 * `bluesky-api.ts`). Anything the endpoint has no parameter for is deliberately
 * absent: an unsupported operator is not rejected by the server, it is treated
 * as a search *word*, which silently changes what you asked for.
 */

import {
  BlueskyPostSearch,
  emptyBlueskyPostSearch,
} from '../../providers/bluesky/bluesky-post-search';

/**
 * Operators that take a value, mapped to the criteria field they fill.
 *
 * `since`/`until` are Bluesky's names for what the Mastodon side calls
 * after/before. We keep Bluesky's spelling in the query string — it is what
 * bsky.app documents and what people paste — and translate at this boundary
 * rather than teaching the reader a dialect only this app speaks.
 */
const VALUE_OPERATORS: Record<string, keyof BlueskyPostSearch> = {
  from: 'author',
  mentions: 'mentions',
  lang: 'language',
  language: 'language',
  domain: 'domain',
  url: 'url',
  since: 'after',
  until: 'before',
};

/** Fields that hold a handle, where a leading @ is noise the server rejects. */
const HANDLE_FIELDS = new Set<keyof BlueskyPostSearch>(['author', 'mentions']);

/**
 * Split a query into tokens, keeping quoted phrases whole.
 *
 * Quoted phrases stay quoted in `text`: `searchPosts` honours them as phrase
 * matches, so stripping the quotes here would broaden the search.
 */
function tokenize(query: string): string[] {
  return query.match(/"[^"]*"|\S+/gu) ?? [];
}

/** Trim a value, strip surrounding quotes, and drop a leading @ for handles. */
function cleanValue(raw: string, field: keyof BlueskyPostSearch): string {
  const unquoted = raw.replace(/^"(.*)"$/u, '$1').trim();
  return HANDLE_FIELDS.has(field) ? unquoted.replace(/^@/, '') : unquoted;
}

/**
 * Parse a typed query into criteria.
 *
 * Everything that is not a recognised operator stays in `text`, in the order it
 * was typed. That is the honest behaviour: `searchPosts` would have received
 * those words as query text anyway, so an operator we do not know about behaves
 * exactly as it does on bsky.app — as a word.
 *
 * Existing criteria are *replaced*, not merged: the query box is the source of
 * truth when the reader edits it, and a stale `domain:` left over from a
 * previous search silently narrowing the new one is the bug this avoids.
 */
export function parseBlueskyQuery(query: string): BlueskyPostSearch {
  const criteria = emptyBlueskyPostSearch();
  const words: string[] = [];
  const tags: string[] = [];

  for (const token of tokenize(query)) {
    // A bare #tag is a tag filter, not a word — same as bsky.app. Written as an
    // AND-matched `tag` param, which is what the endpoint does with it.
    if (token.startsWith('#') && token.length > 1) {
      const tag = token.slice(1);
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
      continue;
    }

    const match = /^([a-z]+):(.*)$/iu.exec(token);
    if (match) {
      const [, name, rawValue] = match;
      const field = VALUE_OPERATORS[name.toLowerCase()];
      if (field) {
        const value = cleanValue(rawValue, field);
        if (value) {
          // `as never` because the mapped field type varies per key; every
          // target here is a string field, which the table above guarantees.
          criteria[field] = value as never;
        }
        continue;
      }
      // `tag:angular` is the long form of `#angular`.
      if (name.toLowerCase() === 'tag') {
        const tag = cleanValue(rawValue, 'tags').replace(/^#/, '');
        if (tag && !tags.includes(tag)) {
          tags.push(tag);
        }
        continue;
      }
    }

    words.push(token);
  }

  criteria.text = words.join(' ');
  if (tags.length) {
    criteria.tags = tags;
  }
  return criteria;
}

/**
 * Render criteria back into a typed query.
 *
 * The inverse of {@link parseBlueskyQuery} for every field the parser reads, so
 * a round trip through the Advanced form and back into the box is lossless.
 * `sort` is deliberately excluded: it is a ranking control with its own widget,
 * not a filter, and `sort:top` is not something the box accepts.
 */
export function serializeBlueskyQuery(criteria: BlueskyPostSearch): string {
  const parts: string[] = [];
  const text = criteria.text.trim();
  if (text) {
    parts.push(text);
  }
  const push = (operator: string, value: string | undefined, handle = false) => {
    const cleaned = value?.trim();
    if (cleaned) {
      parts.push(`${operator}:${handle ? cleaned.replace(/^@/, '') : cleaned}`);
    }
  };
  push('from', criteria.author, true);
  push('mentions', criteria.mentions, true);
  for (const tag of criteria.tags ?? []) {
    parts.push(`#${tag}`);
  }
  push('lang', criteria.language);
  push('domain', criteria.domain);
  push('url', criteria.url);
  push('since', criteria.after);
  push('until', criteria.before);
  return parts.join(' ');
}

/** Whether a typed query uses any operator at all — drives the "parsed" hint. */
export function hasBlueskyOperators(query: string): boolean {
  return tokenize(query).some(
    (token) =>
      (token.startsWith('#') && token.length > 1) ||
      (/^([a-z]+):/iu.test(token) &&
        (VALUE_OPERATORS[token.split(':')[0].toLowerCase()] !== undefined ||
          token.split(':')[0].toLowerCase() === 'tag')),
  );
}
