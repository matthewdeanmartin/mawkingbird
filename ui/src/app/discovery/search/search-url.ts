/**
 * Encode/decode a `MawkingbirdSearch` to and from URL query params (spec §16).
 *
 * A shareable URL captures the *pre-search definition* — target, text criteria,
 * advanced options, and the API-call budget — but NOT transient view state
 * (which page you loaded, active facets, scroll position). Sharing the query
 * definition, not a results snapshot, is the whole contract.
 *
 * Two encodings:
 *  - readable flat params (`?type=posts&q=angular&after=…&calls=3`) for simple
 *    searches — human-editable, the nice case;
 *  - a compact versioned blob (`?s=<base64url-json>`) when the search is richer
 *    than the flat params can carry.
 *
 * Because the structured object is the source of truth, decoding just validates
 * fields back into the object — there is no DSL to parse. Anything malformed or
 * unknown is ignored, and a broken `?s=` falls back to a safe empty search.
 */

import {
  ApiCallBudget,
  emptySearch,
  MawkingbirdSearch,
  PostContentType,
  SearchTarget,
  Tristate,
} from './mawkingbird-search';

const TARGETS: readonly SearchTarget[] = ['accounts', 'hashtags', 'posts'];
const CONTENT_TYPES: readonly PostContentType[] = [
  'any',
  'media',
  'image',
  'video',
  'audio',
  'poll',
  'link',
  'text',
];
const TRISTATES: readonly Tristate[] = ['include', 'only', 'exclude'];
const SCOPES = ['all', 'public', 'library'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when the search needs the compact blob (has richer post criteria than
 *  the flat params represent). Simple searches stay human-readable. */
function needsBlob(s: MawkingbirdSearch): boolean {
  if (s.target === 'accounts') {
    const a = s.account;
    // Anything beyond a plain text search needs the structured blob.
    return !!(a && ((a.source && a.source !== 'both') || a.followers || a.following || a.statuses));
  }
  const p = s.post;
  if (s.target !== 'posts' || !p) {
    return false;
  }
  return !!(
    p.exactPhrase ||
    p.excludeWords ||
    p.author ||
    p.dates?.before ||
    p.replies ||
    p.sensitive
  );
}

function base64UrlEncode(json: string): string {
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(blob: string): string {
  const padded = blob.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(padded)));
}

/** Serialize a search to URL query params. Returns a plain record so the caller
 *  can hand it straight to Angular's Router. */
export function encodeSearchToParams(search: MawkingbirdSearch): Record<string, string> {
  if (needsBlob(search)) {
    return { s: base64UrlEncode(JSON.stringify(search)) };
  }

  const params: Record<string, string> = { type: search.target };
  if (search.apiCallBudget) {
    params['calls'] = String(search.apiCallBudget);
  }

  if (search.target === 'accounts' && search.account?.text) {
    params['q'] = search.account.text;
  } else if (search.target === 'hashtags' && search.hashtag?.text) {
    params['q'] = search.hashtag.text;
  } else if (search.target === 'posts' && search.post) {
    const p = search.post;
    if (p.words) params['q'] = p.words;
    if (p.language) params['language'] = p.language;
    if (p.dates?.after) params['after'] = p.dates.after;
    if (p.contentType && p.contentType !== 'any') params['media'] = p.contentType;
    if (p.scope && p.scope !== 'all') params['scope'] = p.scope;
  }
  return params;
}

/** Decode a search from a param map (Angular's ParamMap or a plain getter).
 *  Invalid/unknown fields are ignored; a malformed blob yields a safe empty
 *  search so the form never crashes. */
export function decodeSearchFromParams(get: (key: string) => string | null): MawkingbirdSearch {
  const blob = get('s');
  if (blob) {
    return decodeBlob(blob);
  }

  const targetRaw = get('type');
  const target: SearchTarget = TARGETS.includes(targetRaw as SearchTarget)
    ? (targetRaw as SearchTarget)
    : 'accounts';
  const search = emptySearch(target);

  const calls = Number(get('calls'));
  if (Number.isInteger(calls) && calls > 0 && calls <= 50) {
    search.apiCallBudget = calls as ApiCallBudget;
  }

  const q = get('q') ?? '';
  if (target === 'accounts') {
    search.account = { text: q };
  } else if (target === 'hashtags') {
    search.hashtag = { text: q };
  } else {
    const language = get('language');
    const after = get('after');
    const media = get('media');
    const scope = get('scope');
    search.post = {
      words: q || undefined,
      language: language || undefined,
      dates: after && DATE_RE.test(after) ? { after } : undefined,
      contentType: CONTENT_TYPES.includes(media as PostContentType)
        ? (media as PostContentType)
        : undefined,
      scope: (SCOPES as readonly string[]).includes(scope ?? '')
        ? (scope as 'all' | 'public' | 'library')
        : undefined,
    };
  }
  return search;
}

/** Validate + coerce a decoded blob into a well-formed MawkingbirdSearch. Any
 *  problem returns a safe empty search rather than throwing. */
function decodeBlob(blob: string): MawkingbirdSearch {
  try {
    const raw = JSON.parse(base64UrlDecode(blob)) as Partial<MawkingbirdSearch>;
    const target: SearchTarget = TARGETS.includes(raw.target as SearchTarget)
      ? (raw.target as SearchTarget)
      : 'posts';
    const out = emptySearch(target);

    if (Number.isInteger(raw.apiCallBudget) && (raw.apiCallBudget as number) > 0) {
      out.apiCallBudget = raw.apiCallBudget as ApiCallBudget;
    }

    if (target === 'accounts' && raw.account) {
      const a = raw.account;
      out.account = {
        text: String(a.text ?? ''),
        source: (['bio', 'posts', 'both'] as const).includes(a.source as never)
          ? a.source
          : undefined,
        followers: cleanRange(a.followers),
        following: cleanRange(a.following),
        statuses: cleanRange(a.statuses),
      };
    } else if (target === 'hashtags' && raw.hashtag) {
      out.hashtag = { text: String(raw.hashtag.text ?? '') };
    } else if (target === 'posts' && raw.post) {
      const p = raw.post;
      out.post = {
        words: str(p.words),
        exactPhrase: str(p.exactPhrase),
        excludeWords: str(p.excludeWords),
        author: str(p.author),
        language: str(p.language),
        dates: cleanDates(p.dates),
        contentType: CONTENT_TYPES.includes(p.contentType as PostContentType)
          ? (p.contentType as PostContentType)
          : undefined,
        replies: TRISTATES.includes(p.replies as Tristate) ? (p.replies as Tristate) : undefined,
        sensitive: TRISTATES.includes(p.sensitive as Tristate)
          ? (p.sensitive as Tristate)
          : undefined,
        scope: (SCOPES as readonly string[]).includes(p.scope ?? '')
          ? (p.scope as 'all' | 'public' | 'library')
          : undefined,
      };
    }
    return out;
  } catch {
    return emptySearch('posts');
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Coerce a decoded numeric range, keeping only finite non-negative bounds. */
function cleanRange(r: unknown): { min?: number; max?: number } | undefined {
  if (!r || typeof r !== 'object') {
    return undefined;
  }
  const obj = r as { min?: unknown; max?: unknown };
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
  const min = num(obj.min);
  const max = num(obj.max);
  return min != null || max != null ? { min, max } : undefined;
}

function cleanDates(
  d: { after?: string; before?: string } | undefined,
): { after?: string; before?: string } | undefined {
  if (!d) return undefined;
  const after = d.after && DATE_RE.test(d.after) ? d.after : undefined;
  const before = d.before && DATE_RE.test(d.before) ? d.before : undefined;
  return after || before ? { after, before } : undefined;
}
