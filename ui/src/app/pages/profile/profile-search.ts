import { Status } from '../../models';

/** What the profile's search box can narrow on, scoped to one account. */
export interface ProfileSearchCriteria {
  /** Free text; every word must appear somewhere in the post. */
  words: string;
  /** Posts on or after this date (yyyy-mm-dd). */
  after?: string;
  /** Posts on or before this date (yyyy-mm-dd). */
  before?: string;
  /** BCP-47 code, matched against the post's declared language. */
  language?: string;
  hasMedia?: boolean;
  hasLink?: boolean;
  /** Drop replies from the results. */
  excludeReplies?: boolean;
}

export function emptyProfileSearch(): ProfileSearchCriteria {
  return { words: '' };
}

/** True when nothing is set — the point at which the profile shows its timeline again. */
export function isEmptyCriteria(c: ProfileSearchCriteria): boolean {
  return (
    !c.words.trim() &&
    !c.after &&
    !c.before &&
    !c.language &&
    !c.hasMedia &&
    !c.hasLink &&
    !c.excludeReplies
  );
}

/**
 * Turn a status into the text a query is matched against.
 *
 * The content is HTML, and searching it raw would match on tag names and
 * attribute values — a search for "class" hitting every post, a search for
 * "https" hitting every link. Tags are stripped and entities decoded so what is
 * matched is what the reader sees, plus the parts that are readable but not in
 * the body: the spoiler warning, the poll options, and image alt text.
 */
export function searchableText(status: Status): string {
  const source = status.reblog ?? status;
  const parts = [
    stripHtml(source.content ?? ''),
    source.spoiler_text ?? '',
    ...(source.poll?.options ?? []).map((o) => o.title),
    ...(source.media_attachments ?? []).map((m) => m.description ?? ''),
  ];
  return parts.join(' ').toLowerCase();
}

function stripHtml(html: string): string {
  // `<br>` and `</p>` are word boundaries; without the space, "one<br>two"
  // would match a search for "onetwo" and not for "one".
  const spaced = html.replace(/<(br|\/p|\/div)[^>]*>/gi, ' ');
  const text = spaced.replace(/<[^>]*>/g, '');
  return decodeEntities(text);
}

function decodeEntities(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

/**
 * Split a query into terms, honouring "quoted phrases".
 *
 * Every term must be present — an AND, not an OR. Searching one person's posts
 * for `angular signals` almost always means both words; an OR there returns
 * their entire history of saying "signals".
 */
export function queryTerms(words: string): string[] {
  const terms: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(words)) !== null) {
    const term = (match[1] ?? match[2] ?? '').trim().toLowerCase();
    if (term) {
      terms.push(term);
    }
  }
  return terms;
}

/** True when the status has at least one image, video, audio or gif attached. */
function hasMedia(status: Status): boolean {
  return ((status.reblog ?? status).media_attachments ?? []).length > 0;
}

/** True when the status links out — a card, or an anchor in the body. */
function hasLink(status: Status): boolean {
  const source = status.reblog ?? status;
  if (source.card) {
    return true;
  }
  // Hashtags and mentions are anchors too; a "has a link" filter that matches
  // every tagged post is useless, so those are excluded.
  return /<a\s[^>]*href=/i.test(source.content ?? '')
    ? /<a\s(?![^>]*class="[^"]*(?:hashtag|mention)[^"]*")[^>]*href="https?:/i.test(
        source.content ?? '',
      )
    : false;
}

function isReply(status: Status): boolean {
  return !!(status.reblog ?? status).in_reply_to_id;
}

/** The post's own date, as yyyy-mm-dd in UTC, for comparing against the bounds. */
function postDay(status: Status): string {
  return (status.reblog ?? status).created_at.slice(0, 10);
}

/**
 * Filter already-fetched statuses down to the ones matching the criteria.
 *
 * This is the client half of the hybrid: the server is asked first with
 * `from:`-style operators, which real Mastodon honours for its own full-text
 * index, and this runs over the posts the profile has already paged in. The two
 * cover different gaps — the server sees the account's whole history but only
 * indexes some of it, this sees everything it was given but only what was
 * fetched — so the results are merged rather than one replacing the other.
 */
export function filterStatuses(
  statuses: readonly Status[],
  criteria: ProfileSearchCriteria,
): Status[] {
  const terms = queryTerms(criteria.words);
  return statuses.filter((status) => {
    if (criteria.excludeReplies && isReply(status)) {
      return false;
    }
    if (criteria.hasMedia && !hasMedia(status)) {
      return false;
    }
    if (criteria.hasLink && !hasLink(status)) {
      return false;
    }
    if (criteria.language && (status.reblog ?? status).language !== criteria.language) {
      return false;
    }
    const day = postDay(status);
    if (criteria.after && day < criteria.after) {
      return false;
    }
    if (criteria.before && day > criteria.before) {
      return false;
    }
    if (!terms.length) {
      return true;
    }
    const text = searchableText(status);
    return terms.every((term) => text.includes(term));
  });
}

/**
 * The server-side query for this account, or null when there is nothing to ask.
 *
 * Operators only mean something to an instance's full-text search, and a query
 * of nothing but `from:` would ask the server to return the account's entire
 * history — which the profile timeline already shows. So the server is only
 * asked when there are words to search for.
 */
export function serverQuery(handle: string, criteria: ProfileSearchCriteria): string | null {
  const words = criteria.words.trim();
  if (!words) {
    return null;
  }
  const parts = [`from:@${handle.replace(/^@/, '')}`, words];
  if (criteria.after) {
    parts.push(`after:${criteria.after}`);
  }
  if (criteria.before) {
    parts.push(`before:${criteria.before}`);
  }
  if (criteria.language) {
    parts.push(`language:${criteria.language}`);
  }
  if (criteria.hasMedia) {
    parts.push('has:media');
  }
  if (criteria.excludeReplies) {
    parts.push('-is:reply');
  }
  return parts.join(' ');
}

/** Merge server and client hits, newest first, without duplicates. */
export function mergeResults(server: readonly Status[], client: readonly Status[]): Status[] {
  const byId = new Map<string, Status>();
  for (const status of [...server, ...client]) {
    if (!byId.has(status.id)) {
      byId.set(status.id, status);
    }
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
