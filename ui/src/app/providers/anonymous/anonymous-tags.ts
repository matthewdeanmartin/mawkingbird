import { computed, inject, Injectable, signal } from '@angular/core';
import { AnonymousHomeFeedCache } from './anonymous-home-feed-cache';

const STORAGE_KEY = 'mockingbird_anonymous_tags';
const STATE_VERSION = 1;
export const ANONYMOUS_TAG_LIMIT = 10;

interface AnonymousTagState {
  version: typeof STATE_VERSION;
  tags: string[];
}

export type TagFollowResult = { ok: true } | { ok: false; error: string };

function normalize(name: string): string {
  return name.trim().replace(/^#/, '').toLowerCase();
}

function loadState(): AnonymousTagState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<AnonymousTagState> | null;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.tags)) {
      return { version: STATE_VERSION, tags: [] };
    }
    const tags = [...new Set(parsed.tags.filter((tag) => typeof tag === 'string').map(normalize))]
      .filter(Boolean)
      .slice(0, ANONYMOUS_TAG_LIMIT);
    return { version: STATE_VERSION, tags };
  } catch {
    return { version: STATE_VERSION, tags: [] };
  }
}

/** Browser-local followed hashtags (saved public searches) for Anonymous. */
@Injectable({ providedIn: 'root' })
export class AnonymousTags {
  private state = signal(loadState());
  private homeFeedCache = inject(AnonymousHomeFeedCache);

  readonly tags = computed(() => this.state().tags);
  readonly count = computed(() => this.tags().length);

  has(name: string): boolean {
    return this.tags().includes(normalize(name));
  }

  follow(name: string): TagFollowResult {
    const tag = normalize(name);
    if (!tag || this.has(tag)) {
      return { ok: true };
    }
    if (this.count() >= ANONYMOUS_TAG_LIMIT) {
      return {
        ok: false,
        error: `Anonymous accounts can follow up to ${ANONYMOUS_TAG_LIMIT} hashtags.`,
      };
    }
    this.homeFeedCache.invalidate();
    this.persist([...this.tags(), tag]);
    return { ok: true };
  }

  unfollow(name: string): void {
    const tag = normalize(name);
    if (this.has(tag)) this.homeFeedCache.invalidate();
    this.persist(this.tags().filter((saved) => saved !== tag));
  }

  private persist(tags: string[]): void {
    const state: AnonymousTagState = { version: STATE_VERSION, tags };
    this.state.set(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}
