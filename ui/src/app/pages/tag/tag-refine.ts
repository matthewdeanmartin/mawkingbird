import { ParamMap } from '@angular/router';

/** Mastodon reads at most four tags per any/all/none list (`TagFeed::LIMIT_PER_MODE`). */
export const TAG_REFINE_LIMIT = 4;

/** How a hashtag page is narrowed on the server; kept in the URL so it can be shared. */
export interface TagRefineState {
  any: string[];
  all: string[];
  none: string[];
  local: boolean;
}

export const NO_REFINE: TagRefineState = { any: [], all: [], none: [], local: false };

/**
 * Tags typed as `#a b, c`: hashes and separators dropped, duplicates and the
 * page's own tag removed, capped at what the server will read.
 */
export function parseTagList(text: string | null | undefined, mainTag: string): string[] {
  const seen = new Set([mainTag.toLocaleLowerCase()]);
  const tags: string[] = [];
  for (const raw of (text ?? '').split(/[\s,]+/)) {
    const tag = raw.replace(/^#+/, '').trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.slice(0, TAG_REFINE_LIMIT);
}

export function refineFromQuery(params: ParamMap, mainTag: string): TagRefineState {
  return {
    any: parseTagList(params.get('any'), mainTag),
    all: parseTagList(params.get('all'), mainTag),
    none: parseTagList(params.get('none'), mainTag),
    local: params.get('local') === '1',
  };
}

/** Query params for `state`; empty lists become `null` so they leave the URL. */
export function refineToQuery(state: TagRefineState): Record<string, string | null> {
  const list = (tags: string[]) => (tags.length ? tags.join(' ') : null);
  return {
    any: list(state.any),
    all: list(state.all),
    none: list(state.none),
    local: state.local ? '1' : null,
  };
}

/** How many refinements are in force, for the disclosure's label. */
export function refineCount(state: TagRefineState): number {
  return (
    (state.any.length ? 1 : 0) +
    (state.all.length ? 1 : 0) +
    (state.none.length ? 1 : 0) +
    (state.local ? 1 : 0)
  );
}

export function sameRefine(a: TagRefineState, b: TagRefineState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
