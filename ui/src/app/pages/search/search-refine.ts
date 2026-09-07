/**
 * Pure client-side refinement over search results we've *already* fetched:
 * loaded-result text filter (§12), facets (§11), grouping (§13), and active
 * chips (§10). None of this makes an API call — it only ever narrows/reshapes
 * the statuses already in memory. The search page component stays thin by
 * delegating here, and these functions carry the test coverage.
 *
 * See `spec/search/better_search.md`.
 */

import { Status } from '../../models';

// Facet/group labels are translation keys, not English — see the
// `migrate-i18n` skill's "indirect keys" idiom.
// i18n pages.search.facet.language: Language
// i18n pages.search.facet.author: Author
// i18n pages.search.facet.media: Media
// i18n pages.search.facet.textOnly: Text only
// i18n pages.search.mediaType.image: Image
// i18n pages.search.mediaType.video: Video
// i18n pages.search.mediaType.gifv: GIF
// i18n pages.search.mediaType.audio: Audio
// i18n pages.search.facet.type: Type
// i18n pages.search.facet.replies: Replies
// i18n pages.search.facet.originalPosts: Original posts
// i18n pages.search.facet.sensitive: Sensitive
// i18n pages.search.facet.notSensitive: Not sensitive
// i18n pages.search.group.today: Today
// i18n pages.search.group.yesterday: Yesterday
// i18n pages.search.group.earlier: Earlier

/** Strip HTML tags to plain text for substring matching / filtering. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The domain portion of an `acct` (`user@host` → `host`; local `user` → ''). */
export function acctDomain(acct: string): string {
  const at = acct.indexOf('@');
  return at === -1 ? '' : acct.slice(at + 1).toLowerCase();
}

/**
 * §12: filter loaded statuses by a substring typed into "Filter these results".
 * Matches rendered post text, content-warning text, and author name/handle.
 * Case-insensitive; empty filter returns everything.
 */
export function filterLoaded(statuses: Status[], text: string): Status[] {
  const needle = text.trim().toLowerCase();
  if (!needle) {
    return statuses;
  }
  return statuses.filter((s) => {
    const haystack = [
      plainText(s.content),
      s.spoiler_text ?? '',
      s.account.display_name ?? '',
      s.account.acct ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export interface FacetValue {
  /** Stable key used for selection/matching (e.g. a language code or domain). */
  value: string;
  /** The key to translate, or null when the label is result data. */
  labelKey: string | null;
  /** Literal result data, set only when `labelKey` is null. */
  text?: string;
  /** Number of currently-loaded results matching this value. */
  count: number;
}

export type FacetKind = 'language' | 'author' | 'media' | 'replies' | 'sensitive' | 'domain';

export interface Facet {
  kind: FacetKind;
  labelKey: string;
  values: FacetValue[];
}

/** Media bucket for a status: its first attachment's type, else 'none'. */
function mediaKind(s: Status): string {
  const first = s.media_attachments?.[0];
  return first ? first.type : 'none';
}

/** Known Mastodon attachment types translated by key; anything else falls back
 *  to the raw type capitalised, so an unrecognised type still reads sensibly
 *  rather than throwing. */
const MEDIA_TYPE_KEYS: Record<string, string> = {
  image: 'pages.search.mediaType.image',
  video: 'pages.search.mediaType.video',
  gifv: 'pages.search.mediaType.gifv',
  audio: 'pages.search.mediaType.audio',
};

function mediaKindLabel(kind: string): string {
  if (kind === 'none') {
    return 'pages.search.facet.textOnly';
  }
  return MEDIA_TYPE_KEYS[kind] ?? kind[0].toUpperCase() + kind.slice(1);
}

/**
 * §11: facets derived *only* from the loaded results. Counts mean "loaded
 * results matching this value" — never total server counts. Values are sorted
 * by descending count; single-valued facets remain visible so even a narrow
 * search has refinement controls. Callers apply the §11.2 "show at most 5" cap in the UI.
 */
export function buildFacets(statuses: Status[]): Facet[] {
  if (!statuses.length) {
    return [];
  }

  const facets: Facet[] = [];

  const tally = (
    kind: FacetKind,
    labelKey: string,
    pick: (s: Status) => { value: string; labelKey: string | null; text?: string } | null,
  ): void => {
    const counts = new Map<string, FacetValue>();
    for (const s of statuses) {
      const hit = pick(s);
      if (!hit || !hit.value) {
        continue;
      }
      const existing = counts.get(hit.value);
      if (existing) {
        existing.count++;
      } else {
        counts.set(hit.value, {
          value: hit.value,
          labelKey: hit.labelKey,
          text: hit.text,
          count: 1,
        });
      }
    }
    const values = [...counts.values()].sort((a, b) => b.count - a.count);
    // Keep populated facets visible, including a single loaded value.
    if (values.length > 0) {
      facets.push({ kind, labelKey, values });
    }
  };

  tally('language', 'pages.search.facet.language', (s) =>
    s.language ? { value: s.language, labelKey: null, text: s.language.toUpperCase() } : null,
  );
  tally('author', 'pages.search.facet.author', (s) => ({
    value: s.account.acct,
    labelKey: null,
    text: s.account.display_name || s.account.acct,
  }));
  tally('media', 'pages.search.facet.media', (s) => {
    const k = mediaKind(s);
    return { value: k, labelKey: mediaKindLabel(k) };
  });
  tally('replies', 'pages.search.facet.type', (s) =>
    s.in_reply_to_id
      ? { value: 'reply', labelKey: 'pages.search.facet.replies' }
      : { value: 'original', labelKey: 'pages.search.facet.originalPosts' },
  );
  tally('sensitive', 'pages.search.facet.sensitive', (s) =>
    s.sensitive
      ? { value: 'yes', labelKey: 'pages.search.facet.sensitive' }
      : { value: 'no', labelKey: 'pages.search.facet.notSensitive' },
  );
  tally('domain', 'pages.search.facet.authorDomain', (s) => {
    const d = acctDomain(s.account.acct);
    return d
      ? { value: d, labelKey: null, text: d }
      : { value: 'local', labelKey: 'pages.search.facet.thisServer' };
  });

  return facets;
}

/** Does a status match a chosen facet value? Mirrors `buildFacets`'s buckets. */
export function statusMatchesFacet(s: Status, kind: FacetKind, value: string): boolean {
  switch (kind) {
    case 'language':
      return s.language === value;
    case 'author':
      return s.account.acct === value;
    case 'media':
      return mediaKind(s) === value;
    case 'replies':
      return value === 'reply' ? !!s.in_reply_to_id : !s.in_reply_to_id;
    case 'sensitive':
      return value === 'yes' ? s.sensitive : !s.sensitive;
    case 'domain':
      return (acctDomain(s.account.acct) || 'local') === value;
  }
}

// ---------------------------------------------------------------------------
// Flood control: excluding authors, and collapsing repeated posts
// ---------------------------------------------------------------------------

/**
 * Keyword searches are routinely dominated by two or three accounts posting the
 * same thing over and over. It isn't spam exactly — it's flooding — and it
 * makes a search useless because every real result is buried.
 *
 * Mastodon's search has no `-from:` operator, so a "minus" query can't fix this
 * server-side: the exclusion has to happen over the results we already hold.
 * That is what the two tools here do, from opposite directions:
 *
 *  - {@link excludeAuthors} removes a person, when the account is the problem.
 *  - {@link collapseRepeats} removes the *repetition*, when the behaviour is —
 *    keeping one copy of each thing said, so a flooder still appears once and
 *    an account posting genuinely different things is untouched.
 *
 * Both are pure filters over loaded statuses. Neither is persisted: see the
 * search page's `excludedAuthors` for why exclusion is scoped to one query.
 */

/** Drop every status whose author is in `acct` set. Empty set = no-op. */
export function excludeAuthors(statuses: Status[], excluded: ReadonlySet<string>): Status[] {
  if (!excluded.size) {
    return statuses;
  }
  return statuses.filter((s) => !excluded.has(s.account.acct));
}

/**
 * A normalised fingerprint of what a post actually says.
 *
 * Flooders rarely post *byte*-identical text: they rotate a hashtag, add an
 * emoji, bump a link's tracking parameter. Comparing raw content would catch
 * almost none of it. So this strips markup, drops URLs, hashtags, mentions and
 * punctuation, collapses whitespace, and lowercases — leaving the words. Two
 * posts advertising the same thing with a different tag land on the same key.
 *
 * A post whose text is *only* links and tags fingerprints to an empty string;
 * {@link collapseRepeats} treats those as unique rather than folding every
 * image-only post in the corpus into one row.
 */
export function contentFingerprint(status: Status): string {
  return plainText(status.content ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#]\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A kept status plus however many near-identical ones it stands in for. */
export interface CollapsedStatus {
  status: Status;
  /** Near-identical posts by the same author that this row hides. 0 = normal. */
  duplicates: Status[];
}

/**
 * Collapse runs of near-identical posts *by the same author* down to one row.
 *
 * Scoped per author on purpose: two different people saying the same short
 * thing ("congrats!") is a coincidence and both are real results, while one
 * person saying it thirty times is the flood. The first occurrence in the
 * incoming order is the one kept, so an already-sorted list keeps its ordering
 * and the survivor is whichever the sort ranked highest.
 */
export function collapseRepeats(statuses: Status[]): CollapsedStatus[] {
  const byKey = new Map<string, CollapsedStatus>();
  const out: CollapsedStatus[] = [];
  for (const status of statuses) {
    const print = contentFingerprint(status);
    // Nothing quotable left (link- or image-only): never fold these together.
    if (!print) {
      out.push({ status, duplicates: [] });
      continue;
    }
    const key = `${status.account.acct}\u0000${print}`;
    const seen = byKey.get(key);
    if (seen) {
      seen.duplicates.push(status);
    } else {
      const entry: CollapsedStatus = { status, duplicates: [] };
      byKey.set(key, entry);
      out.push(entry);
    }
  }
  return out;
}

/** How many posts `collapseRepeats` folded away — for the "N hidden" line. */
export function collapsedCount(rows: CollapsedStatus[]): number {
  return rows.reduce((sum, row) => sum + row.duplicates.length, 0);
}

export interface StatusGroup {
  key: string;
  label: string;
  /**
   * Whether `label` is a translation key to pipe through `transloco`, or an
   * already-formatted string (the per-weekday date labels from `Intl`, which
   * vary with the date itself and cannot be a fixed key). `''` (grouping
   * 'none') is neither and is never rendered.
   */
  labelIsKey: boolean;
  statuses: Status[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-calendar day label for the date grouping (§13.3). */
function dateBucket(
  created: string,
  now: number,
): { key: string; label: string; labelIsKey: boolean; order: number } {
  const then = new Date(created);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((startOfToday.getTime() - then.getTime()) / DAY_MS);
  if (then.getTime() >= startOfToday.getTime()) {
    return { key: 'today', label: 'pages.search.group.today', labelIsKey: true, order: 0 };
  }
  if (diffDays < 1) {
    return {
      key: 'yesterday',
      label: 'pages.search.group.yesterday',
      labelIsKey: true,
      order: 1,
    };
  }
  if (diffDays < 7) {
    // Already locale-correct via Intl — not a key, because the value itself
    // varies with every date, not just with the reader's language.
    const label = then.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    // Order by recency within the week; older = higher order number.
    return { key: label, label, labelIsKey: false, order: 2 + diffDays };
  }
  return { key: 'earlier', label: 'pages.search.group.earlier', labelIsKey: true, order: 1000 };
}

/**
 * §13: reshape (never re-fetch) the loaded statuses. `none` preserves the
 * server's returned order; `author` groups under account headers preserving
 * order within each; `date` buckets by local calendar day.
 */
export function groupResults(
  statuses: Status[],
  grouping: 'none' | 'author' | 'date',
  now: number = Date.now(),
): StatusGroup[] {
  if (grouping === 'none' || !statuses.length) {
    return [{ key: 'all', label: '', labelIsKey: false, statuses }];
  }

  if (grouping === 'author') {
    const groups: StatusGroup[] = [];
    const index = new Map<string, StatusGroup>();
    for (const s of statuses) {
      const key = s.account.acct;
      let g = index.get(key);
      if (!g) {
        // An author's display name/handle is not translation-key text either —
        // same reason a date label isn't, once it's off the fixed ladder.
        g = {
          key,
          label: s.account.display_name || s.account.acct,
          labelIsKey: false,
          statuses: [],
        };
        index.set(key, g);
        groups.push(g); // first-seen author order
      }
      g.statuses.push(s);
    }
    return groups;
  }

  // date
  const buckets = new Map<string, StatusGroup & { order: number }>();
  for (const s of statuses) {
    const b = dateBucket(s.created_at, now);
    let g = buckets.get(b.key);
    if (!g) {
      g = { key: b.key, label: b.label, labelIsKey: b.labelIsKey, order: b.order, statuses: [] };
      buckets.set(b.key, g);
    }
    g.statuses.push(s);
  }
  return [...buckets.values()].sort((a, b) => a.order - b.order);
}
