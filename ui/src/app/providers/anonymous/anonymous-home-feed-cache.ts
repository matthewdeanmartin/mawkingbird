import { computed, Injectable, signal } from '@angular/core';
import { Status } from '../../models';

const STORAGE_KEY = 'mockingbird_anonymous_home_feed';
const STATE_VERSION = 3;
const CACHE_LIMIT = 500;

interface AnonymousHomeFeedState {
  version: typeof STATE_VERSION;
  statuses: Status[];
  populatedAt: string | null;
  sourceKey: string;
}

export interface AnonymousCacheLoadReport {
  found: number;
  accepted: number;
  discarded: number;
  reason: 'empty' | 'invalid-envelope' | 'loaded' | 'unreadable';
}

interface LoadedState {
  state: AnonymousHomeFeedState;
  report: AnonymousCacheLoadReport;
}

function emptyState(): AnonymousHomeFeedState {
  return { version: STATE_VERSION, statuses: [], populatedAt: null, sourceKey: '' };
}

function isCacheSafeAccount(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const account = value as Partial<Status['account']>;
  return (
    typeof account.id === 'string' &&
    typeof account.username === 'string' &&
    typeof account.acct === 'string'
  );
}

function isCacheSafeStatus(value: unknown): value is Status {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<Status>;
  if (
    typeof status.id !== 'string' ||
    typeof status.created_at !== 'string' ||
    typeof status.content !== 'string' ||
    !isCacheSafeAccount(status.account) ||
    !Array.isArray(status.media_attachments)
  ) {
    return false;
  }
  if (status.reblog != null && !isCacheSafeStatus(status.reblog)) return false;
  if (status.poll != null && !Array.isArray(status.poll.own_votes)) return false;
  return (
    status.filtered == null ||
    (Array.isArray(status.filtered) &&
      status.filtered.every((result) => Array.isArray(result?.filter?.context)))
  );
}

function loadState(): LoadedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        state: emptyState(),
        report: { found: 0, accepted: 0, discarded: 0, reason: 'empty' },
      };
    }
    const parsed = JSON.parse(raw) as Partial<AnonymousHomeFeedState> | null;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.statuses)) {
      return {
        state: emptyState(),
        report: { found: 0, accepted: 0, discarded: 0, reason: 'invalid-envelope' },
      };
    }
    const found = parsed.statuses.length;
    const statuses = parsed.statuses.filter(isCacheSafeStatus).slice(0, CACHE_LIMIT);
    return {
      state: {
        version: STATE_VERSION,
        statuses,
        populatedAt:
          statuses.length && typeof parsed.populatedAt === 'string' ? parsed.populatedAt : null,
        sourceKey: typeof parsed.sourceKey === 'string' ? parsed.sourceKey : '',
      },
      report: {
        found,
        accepted: statuses.length,
        discarded: found - statuses.length,
        reason: 'loaded',
      },
    };
  } catch {
    return {
      state: emptyState(),
      report: { found: 0, accepted: 0, discarded: 0, reason: 'unreadable' },
    };
  }
}

/** Persisted snapshot used to avoid rebuilding Anonymous Home on every visit. */
@Injectable({ providedIn: 'root' })
export class AnonymousHomeFeedCache {
  private readonly loaded = loadState();
  private state = signal(this.loaded.state);
  private generationValue = 0;

  loadReport = this.loaded.report;

  readonly statuses = computed(() => this.state().statuses);
  readonly populated = computed(
    () => this.state().populatedAt !== null && this.statuses().length > 0,
  );

  generation(): number {
    return this.generationValue;
  }

  matchesSources(sourceKey: string): boolean {
    return this.populated() && this.state().sourceKey === sourceKey;
  }

  store(statuses: Status[], sourceKey = '', generation = this.generationValue): void {
    if (!statuses.length || generation !== this.generationValue) return;
    const state: AnonymousHomeFeedState = {
      version: STATE_VERSION,
      statuses: statuses.slice(0, CACHE_LIMIT),
      populatedAt: new Date().toISOString(),
      sourceKey,
    };
    this.state.set(state);
    this.loadReport = {
      found: statuses.length,
      accepted: state.statuses.length,
      discarded: statuses.length - state.statuses.length,
      reason: 'loaded',
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // A memory-only snapshot still avoids repeat work during this app session.
    }
  }

  invalidate(): void {
    this.generationValue += 1;
    this.state.set(emptyState());
    this.loadReport = { found: 0, accepted: 0, discarded: 0, reason: 'empty' };
    localStorage.removeItem(STORAGE_KEY);
  }
}
