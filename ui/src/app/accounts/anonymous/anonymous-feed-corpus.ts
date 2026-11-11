import { computed, Injectable, signal } from '@angular/core';
import { Status } from '../../platform/api/models';

const STORAGE_KEY = 'mockingbird_anonymous_feed_corpus';
const STATE_VERSION = 1;
export const ANONYMOUS_CORPUS_LIMIT = 500;
/**
 * The most the stored copy may take, in characters of JSON. Every key on the
 * origin shares about 5 MB, and a full `Status` (account, media, card, boost) is
 * around 6,000 characters, so 500 of them was over 3 million: enough to fill
 * storage on its own and make unrelated writes, like switching accounts, fail.
 * The in-memory corpus still keeps {@link ANONYMOUS_CORPUS_LIMIT} posts; the
 * stored copy keeps the newest that fit, which is all a cold start needs.
 */
export const ANONYMOUS_CORPUS_STORED_CHARACTERS = 600_000;

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

/** The newest statuses whose stored state fits the budget. `statuses` is newest first. */
export function storedCorpus(
  statuses: Status[],
  updatedAt: string | null,
  budget = ANONYMOUS_CORPUS_STORED_CHARACTERS,
): AnonymousCorpusState {
  const overhead = JSON.stringify({ version: STATE_VERSION, statuses: [], updatedAt }).length;
  let used = overhead;
  const kept: Status[] = [];
  for (const status of statuses) {
    const size = JSON.stringify(status).length + 1;
    if (used + size > budget) break;
    used += size;
    kept.push(status);
  }
  return { version: STATE_VERSION, statuses: kept, updatedAt };
}

function loadState(): AnonymousCorpusState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? 'null') as Partial<AnonymousCorpusState> | null;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.statuses)) {
      return { version: STATE_VERSION, statuses: [], updatedAt: null };
    }
    const state: AnonymousCorpusState = {
      version: STATE_VERSION,
      statuses: parsed.statuses
        .filter(
          (status): status is Status =>
            typeof status?.id === 'string' && typeof status.account?.username === 'string',
        )
        .slice(0, ANONYMOUS_CORPUS_LIMIT),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
    // Written before the size budget existed: shrink the stored copy now, so a
    // browser that is already full recovers on its next visit, not on the next
    // Anonymous refresh (which a signed-in user may never trigger).
    if (raw && raw.length > ANONYMOUS_CORPUS_STORED_CHARACTERS) {
      writeStored(storedCorpus(state.statuses, state.updatedAt));
    }
    return state;
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
    this.state.set({ version: STATE_VERSION, statuses, updatedAt });
    writeStored(storedCorpus(statuses, updatedAt));
  }
}

function writeStored(state: AnonymousCorpusState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quotas vary. The in-memory corpus stays useful for this session.
  }
}
