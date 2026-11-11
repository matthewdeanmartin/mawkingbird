/**
 * Bluesky post search, as its own criteria object.
 *
 * Deliberately **not** an extension of `MawkingbirdSearch`. The two engines
 * overlap by about a third and diverge in both directions: `domain`, `url`,
 * `mentions` and `sort=top` have no Mastodon equivalent, while `has:media`,
 * `is:reply`, `sensitive` and the local/remote distinction have no Bluesky one.
 * A union type would leave most fields inapplicable on any given branch and put
 * a `source` check in front of every widget.
 *
 * So this is a parallel object with a parallel serializer, and the *page* is
 * what gets reused — result cards, the refine panel's client-side facets, the
 * saved-search plumbing. See `sprint/bsky_parity_003_search.md`.
 */

/** Ranking order. `top` has no Mastodon counterpart at all. */
export type BlueskySearchSort = 'latest' | 'top';

export interface BlueskyPostSearch {
  /** Free text. Passed through as typed — we do not build a Lucene DSL. */
  text: string;
  /** Posts by this account. A bare handle works; the server resolves it. */
  author?: string;
  /** Posts mentioning this account. */
  mentions?: string;
  /** BCP-47 language code, matched against the post's declared `langs`. */
  language?: string;
  /** Posts linking to this hostname. */
  domain?: string;
  /** Posts linking to this exact URL. */
  url?: string;
  /**
   * Hashtags without the `#`. **AND-matched** — two tags narrow the result set,
   * they do not broaden it.
   */
  tags?: string[];
  /** Inclusive lower bound, `YYYY-MM-DD`. Date-only values are accepted. */
  after?: string;
  /** Exclusive upper bound, `YYYY-MM-DD`. */
  before?: string;
  sort?: BlueskySearchSort;
}

export function emptyBlueskyPostSearch(): BlueskyPostSearch {
  return { text: '', sort: 'latest' };
}

/** Whether anything beyond the free text is set (drives the "filters active" chip). */
export function hasBlueskyFilters(criteria: BlueskyPostSearch): boolean {
  return !!(
    criteria.author ||
    criteria.mentions ||
    criteria.language ||
    criteria.domain ||
    criteria.url ||
    criteria.tags?.length ||
    criteria.after ||
    criteria.before ||
    (criteria.sort && criteria.sort !== 'latest')
  );
}

/** A tag list from free-form input: strips `#`, splits on commas/spaces, dedupes. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[\s,]+/)) {
    const tag = raw.replace(/^#/, '').trim();
    if (tag) {
      seen.add(tag);
    }
  }
  return [...seen];
}

/** Human-readable summary of the active filters, for the results header. */
export function describeBlueskyFilters(criteria: BlueskyPostSearch): string[] {
  const out: string[] = [];
  if (criteria.author) {
    out.push(`By @${criteria.author.replace(/^@/, '')}`);
  }
  if (criteria.mentions) {
    out.push(`Mentioning @${criteria.mentions.replace(/^@/, '')}`);
  }
  if (criteria.tags?.length) {
    // Say "all", because the server ANDs them and readers assume OR.
    out.push(
      criteria.tags.length > 1
        ? `Tagged with all of: ${criteria.tags.map((t) => `#${t}`).join(', ')}`
        : `Tagged #${criteria.tags[0]}`,
    );
  }
  if (criteria.language) {
    out.push(`Language: ${criteria.language}`);
  }
  if (criteria.domain) {
    out.push(`Links to ${criteria.domain}`);
  }
  if (criteria.url) {
    out.push(`Links to ${criteria.url}`);
  }
  if (criteria.after) {
    out.push(`After ${criteria.after}`);
  }
  if (criteria.before) {
    out.push(`Before ${criteria.before}`);
  }
  if (criteria.sort === 'top') {
    out.push('Sorted by top');
  }
  return out;
}
