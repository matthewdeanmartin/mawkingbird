import { DiscussionSummary, personKey } from './discussion';

/** Facet choices, as they appear in the URL (`?tag=&instance=&lang=&person=`). */
export interface FacetChoice {
  tag: readonly string[];
  instance: readonly string[];
  lang: readonly string[];
  /** {@link personKey}s, chosen from the Members rail. */
  person: readonly string[];
}

export type FacetKind = keyof FacetChoice;
export const FACET_KINDS: readonly FacetKind[] = ['tag', 'instance', 'lang', 'person'];
export const NO_FACETS: FacetChoice = { tag: [], instance: [], lang: [], person: [] };

export interface FacetValue {
  value: string;
  count: number;
}

export interface FacetCounts {
  tag: FacetValue[];
  instance: FacetValue[];
  lang: FacetValue[];
}

/** MIMB shows the top 20 of each facet. */
export const FACET_LIMIT = 20;

/** The root's declared language, as a base code (`en-GB` → `en`), or null. */
export function languageOf(summary: DiscussionSummary): string | null {
  const declared = summary.discussion.anchor.language?.trim().toLowerCase();
  return declared ? declared.split(/[-_]/, 1)[0] : null;
}

function valuesOf(summary: DiscussionSummary, kind: FacetKind): string[] {
  switch (kind) {
    case 'tag':
      return summary.hashtags;
    case 'instance':
      return summary.instance ? [summary.instance] : [];
    case 'lang': {
      const language = languageOf(summary);
      return language ? [language] : [];
    }
    case 'person':
      return summary.participants.map((participant) => personKey(participant.account));
  }
}

function count(summaries: readonly DiscussionSummary[], kind: FacetKind): FacetValue[] {
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    for (const value of new Set(valuesOf(summary, kind))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, FACET_LIMIT);
}

/**
 * Counts over the discussions in the current tab, before any facet is chosen
 * (MIMB's stable denominator): choosing a hashtag does not make the other
 * hashtags' counts collapse under the reader.
 */
export function facetCounts(summaries: readonly DiscussionSummary[]): FacetCounts {
  return {
    tag: count(summaries, 'tag'),
    instance: count(summaries, 'instance'),
    lang: count(summaries, 'lang'),
  };
}

/** AND across facet kinds, OR within one (MIMB). */
export function applyFacets(
  summaries: readonly DiscussionSummary[],
  choice: FacetChoice,
): DiscussionSummary[] {
  return summaries.filter((summary) =>
    FACET_KINDS.every((kind) => {
      const chosen = choice[kind];
      if (!chosen.length) return true;
      const values = valuesOf(summary, kind);
      return chosen.some((value) => values.includes(value));
    }),
  );
}

export function hasFacets(choice: FacetChoice): boolean {
  return FACET_KINDS.some((kind) => choice[kind].length > 0);
}

/** The choice with one value switched on or off. */
export function toggleFacet(choice: FacetChoice, kind: FacetKind, value: string): FacetChoice {
  const current = choice[kind];
  return {
    ...choice,
    [kind]: current.includes(value)
      ? current.filter((each) => each !== value)
      : [...current, value],
  };
}

/** Query parameters for a choice; empty kinds are removed from the URL. */
export function facetParams(choice: FacetChoice): Record<string, string[] | null> {
  return Object.fromEntries(
    FACET_KINDS.map((kind) => [kind, choice[kind].length ? [...choice[kind]] : null]),
  );
}

/** One person across the visible discussions, for the Members rail's list view. */
export interface ActivePerson {
  person: string;
  account: DiscussionSummary['participants'][number]['account'];
  discussions: number;
  posts: number;
}

/** Who talks most across these discussions: in the most of them, then most posts. */
export function mostActive(summaries: readonly DiscussionSummary[], limit = 12): ActivePerson[] {
  const people = new Map<string, ActivePerson>();
  for (const summary of summaries) {
    for (const participant of summary.participants) {
      const person = personKey(participant.account);
      const seen = people.get(person);
      if (seen) {
        seen.discussions++;
        seen.posts += participant.posts;
      } else {
        people.set(person, {
          person,
          account: participant.account,
          discussions: 1,
          posts: participant.posts,
        });
      }
    }
  }
  return [...people.values()]
    .sort(
      (left, right) =>
        right.discussions - left.discussions ||
        right.posts - left.posts ||
        left.person.localeCompare(right.person),
    )
    .slice(0, limit);
}
