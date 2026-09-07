import { DOC_ROWS, DOC_SECTIONS, DocRow } from './api-docs.generated';

/**
 * Turns an endpoint key from {@link ApiMetrics} (`"GET /api/v1/accounts/:id"`)
 * into a link to the official Mastodon documentation, plus the one-line summary
 * of what the call does.
 *
 * The data comes from the OpenAPI schema (see `ui/scripts/gen-api-docs.mjs`),
 * which carries an exact anchor per operation. Matching happens in three tiers,
 * best first:
 *
 *  1. **Exact** — method + template match a documented operation. Links to the
 *     precise anchor (`/methods/accounts/#update_credentials`) and yields a
 *     summary.
 *  2. **Section** — no operation matched (an endpoint we call that the schema
 *     doesn't cover, or an id segment that didn't normalize the same way), but
 *     the path family is a known docs section. Links to the section page.
 *  3. **None** — not a Mastodon endpoint at all (Bluesky XRPC, an RSS fetch, a
 *     paste service). No link; the table shows nothing rather than a guess.
 *
 * Deliberately not resolved at record time: this is display-only, so it stays
 * out of {@link ApiMetrics} and out of what gets persisted.
 */

const DOCS_BASE = 'https://docs.joinmastodon.org/methods/';

/** How confident the match is — the page dims a section-only link. */
export type DocMatch = 'exact' | 'section';

export interface EndpointDoc {
  url: string;
  match: DocMatch;
  /** The operation's one-line summary; empty for a section-level match. */
  summary: string;
}

/**
 * Rows indexed by `METHOD segment-count`, so a lookup only compares against
 * templates that could possibly match. Built once, lazily.
 */
let byShape: Map<string, DocRow[]> | null = null;

function shapeKey(method: string, segments: number): string {
  return `${method} ${segments}`;
}

function index(): Map<string, DocRow[]> {
  if (byShape) {
    return byShape;
  }
  byShape = new Map<string, DocRow[]>();
  for (const row of DOC_ROWS) {
    const key = shapeKey(row[0], row[1].split('/').length);
    const bucket = byShape.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      byShape.set(key, [row]);
    }
  }
  return byShape;
}

/**
 * Score how well a normalized path fits a documented template: -1 for no match,
 * otherwise the number of segments that matched *literally*.
 *
 * `:id` in the template matches any single segment — not just the ones
 * `normalizeEndpoint` collapsed, because plenty of real ids don't look like ids
 * (a tag name, a short username) and would otherwise never find their docs.
 * That permissiveness is why the score matters: `/api/v1/accounts/:id` and
 * `/api/v1/accounts/verify_credentials` both "match" the latter path, and the
 * caller must take the one with more literal segments.
 */
function score(pathSegments: string[], template: string): number {
  const tpl = template.split('/');
  let literals = 0;
  for (let i = 0; i < tpl.length; i++) {
    if (tpl[i] === ':id') {
      continue;
    }
    if (tpl[i] !== pathSegments[i]) {
      return -1;
    }
    literals++;
  }
  return literals;
}

/** The segment naming the docs section: after `/api/v{n}/`, else the first. */
function familyOf(segments: string[]): string | null {
  const real = segments.filter(Boolean);
  const family = real[0] === 'api' && /^v\d+/.test(real[1] ?? '') ? real[2] : real[0];
  return family ?? null;
}

/**
 * The documented path template a request path belongs to, or null.
 *
 * Exported for {@link normalizeEndpoint}, which has the same problem this
 * module already solved and used to solve it badly. Guessing whether a segment
 * is an identifier from its *shape* cannot work: `/api/v1/tags/SciFi` and
 * `/api/v1/tags/100DaysOfCode` are the same endpoint, but only the second
 * looks id-like, so the two were recorded as different rows — and every tag a
 * person searched became a row of its own, in a table whose whole design is to
 * stay bounded.
 *
 * The API's own shape is the answer. A path that matches a documented template
 * takes that template's `:id` positions, whatever the values look like.
 *
 * Method-insensitive on purpose. A GET to a path documented only for DELETE is
 * still that path, and grouping it under the template is better than leaking
 * the id — the endpoint *rows* keep the method, so nothing is conflated by it.
 */
export function documentedTemplate(path: string): string | null {
  const segments = path.split('/');
  let best: string | null = null;
  let bestScore = -1;
  for (const rows of methodAgnosticIndex().get(segments.length) ?? []) {
    const s = score(segments, rows);
    if (s > bestScore) {
      best = rows;
      bestScore = s;
    }
  }
  return best;
}

/** Templates bucketed by segment count, with duplicates across methods folded. */
let bySegmentCount: Map<number, string[]> | null = null;

function methodAgnosticIndex(): Map<number, string[]> {
  if (bySegmentCount) {
    return bySegmentCount;
  }
  bySegmentCount = new Map<number, string[]>();
  const seen = new Set<string>();
  for (const row of DOC_ROWS) {
    if (seen.has(row[1])) {
      continue;
    }
    seen.add(row[1]);
    const n = row[1].split('/').length;
    const bucket = bySegmentCount.get(n);
    if (bucket) {
      bucket.push(row[1]);
    } else {
      bySegmentCount.set(n, [row[1]]);
    }
  }
  return bySegmentCount;
}

/**
 * Look up documentation for one endpoint key (`"GET /api/v1/accounts/:id"`).
 * Returns null when the endpoint isn't part of the Mastodon API.
 */
export function endpointDoc(key: string): EndpointDoc | null {
  const space = key.indexOf(' ');
  if (space === -1) {
    return null;
  }
  const method = key.slice(0, space).toUpperCase();
  const path = key.slice(space + 1);
  const segments = path.split('/');

  let best: DocRow | null = null;
  let bestScore = -1;
  for (const row of index().get(shapeKey(method, segments.length)) ?? []) {
    const s = score(segments, row[1]);
    if (s > bestScore) {
      best = row;
      bestScore = s;
    }
  }
  if (best) {
    const [, , section, anchor, summary] = best;
    return {
      url: `${DOCS_BASE}${section}/${anchor ? `#${anchor}` : ''}`,
      match: 'exact',
      summary,
    };
  }

  const family = familyOf(segments);
  const section = family ? DOC_SECTIONS[family] : undefined;
  if (section) {
    return { url: `${DOCS_BASE}${section}/`, match: 'section', summary: '' };
  }
  return null;
}
