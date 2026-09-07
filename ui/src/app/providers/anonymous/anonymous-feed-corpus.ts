import { computed, Injectable, signal } from '@angular/core';
import { Status } from '../../models';

const STORAGE_KEY = 'mockingbird_anonymous_feed_corpus';
const STATE_VERSION = 1;
export const ANONYMOUS_CORPUS_LIMIT = 500;

interface AnonymousCorpusState {
  version: typeof STATE_VERSION;
  statuses: Status[];
  updatedAt: string | null;
}

export function canonicalStatusKey(status: Status): string {
  const target = status.reblog ?? status;
  if (target.url) return target.url;
  const ref = target.providerRef as { server?: string; statusId?: string } | undefined;
  if (ref?.server && ref.statusId) return `${ref.server}:${ref.statusId}`;
  return `${target.provider ?? 'mastodon'}:${target.id}`;
}

function loadState(): AnonymousCorpusState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<AnonymousCorpusState> | null;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.statuses)) {
      return { version: STATE_VERSION, statuses: [], updatedAt: null };
    }
    return {
      version: STATE_VERSION,
      statuses: parsed.statuses
        .filter(
          (status): status is Status =>
            typeof status?.id === 'string' && typeof status.account?.username === 'string',
        )
        .slice(0, ANONYMOUS_CORPUS_LIMIT),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return { version: STATE_VERSION, statuses: [], updatedAt: null };
  }
}

/** Bounded, versioned corpus of public posts already acquired for Anonymous. */
@Injectable({ providedIn: 'root' })
export class AnonymousFeedCorpus {
  private state = signal(loadState());

  readonly statuses = computed(() => this.state().statuses);
  readonly updatedAt = computed(() => this.state().updatedAt);

  ingest(statuses: Status[]): void {
    if (!statuses.length) return;
    const byKey = new Map<string, Status>();
    for (const status of [...statuses, ...this.statuses()]) {
      const key = canonicalStatusKey(status);
      if (!byKey.has(key)) byKey.set(key, status);
    }
    const next = [...byKey.values()]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, ANONYMOUS_CORPUS_LIMIT);
    this.persist(next, new Date().toISOString());
  }

  private persist(statuses: Status[], updatedAt: string): void {
    const state: AnonymousCorpusState = { version: STATE_VERSION, statuses, updatedAt };
    this.state.set(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage quotas vary. Keep the useful in-memory corpus for this session.
    }
  }
}
