import { Injectable, signal } from '@angular/core';

const STORE_KEY = 'mockingbird_future_tag_hints';

/** One topic page's future tags, remembered when the reader follows its hashtags. */
export interface FutureTagTopic {
  /** The page's language: the future tags are suggested only for posts in it. */
  lang: string;
  /** Local tags proposed beside a busy English one (`#Fantascienza` for `#ScienceFiction`). */
  futures: { tag: string; source: string }[];
  /** Every hashtag on the page: using one marks a post as being about the topic. */
  topicTags: string[];
}

/** At most this many suggestions at once; the hint is a nudge, not a list. */
const MAX_SUGGESTIONS = 2;

/**
 * Future tags only grow if people post in them. A Feed Builder page proposes
 * them (`pages/feed-builder/`); after the reader follows its hashtags, the
 * composer suggests them for posts written in the page's language about the
 * topic. Suggestion only: the reader adds a tag with a click, never
 * automatically. Kept on this device, keyed by topic and language.
 */
@Injectable({ providedIn: 'root' })
export class FutureTagHints {
  /** Empty where there is no storage, as in the prerender. */
  private readonly store = signal<Record<string, FutureTagTopic>>(load());

  topics(): Record<string, FutureTagTopic> {
    return this.store();
  }

  remember(key: string, topic: FutureTagTopic): void {
    if (!topic.futures.length) return;
    const next = { ...this.topics(), [key]: topic };
    this.store.set(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the suggestion lasts for this session only.
    }
  }
}

/**
 * The future tags worth suggesting for a post: those of every remembered topic
 * in the post's language whose hashtags the post already uses, minus any tag it
 * already has. Pure, so the composer and its specs share it.
 */
export function suggestFutureTags(
  topics: Record<string, FutureTagTopic>,
  text: string,
  lang: string | null,
): string[] {
  if (!lang) return [];
  const used = new Set(
    (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase()),
  );
  if (!used.size) return [];
  const suggestions: string[] = [];
  for (const topic of Object.values(topics)) {
    if (topic.lang !== lang) continue;
    if (!topic.topicTags.some((tag) => used.has(tag.toLowerCase()))) continue;
    // A future tag whose own source is in the post comes first.
    const ranked = [...topic.futures].sort(
      (a, b) => Number(used.has(b.source.toLowerCase())) - Number(used.has(a.source.toLowerCase())),
    );
    for (const { tag } of ranked) {
      const lower = tag.toLowerCase();
      if (used.has(lower) || suggestions.some((each) => each.toLowerCase() === lower)) continue;
      suggestions.push(tag);
    }
  }
  return suggestions.slice(0, MAX_SUGGESTIONS);
}

function load(): Record<string, FutureTagTopic> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as Record<string, FutureTagTopic>) : {};
  } catch {
    return {};
  }
}
