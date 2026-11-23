import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../platform/api/api';
import { describeError } from './bulk-actions';
import { RELATIONSHIP_BATCH } from './follow-state';

/** Ids per relationships request: Mastodon answers only the first 40. */
export const CHECK_BATCH = RELATIONSHIP_BATCH;
/** Most people one check asks about (25 requests). */
export const CHECK_LIMIT = 1000;

export interface DiscoveryCheckState {
  phase: 'checking' | 'done' | 'cancelled' | 'failed';
  accountId: string;
  /** People asked about so far, and how many this run covers. */
  checked: number;
  total: number;
  /** Account id → do they follow you. An absent id is unknown. */
  followsYou: ReadonlyMap<string, boolean>;
  error?: string;
}

/**
 * Asks the server which of the people who reacted follow you.
 *
 * `/accounts/relationships` answers in batches, so this replaces a full
 * follower scan: a few dozen requests at most, however many followers you
 * have. Stopping or failing keeps the answers already received.
 */
@Injectable({ providedIn: 'root' })
export class DiscoveryCheck {
  private readonly api = inject(Api);

  readonly state = signal<DiscoveryCheckState | null>(null);
  readonly running = computed(() => this.state()?.phase === 'checking');

  private cancelRequested = false;

  cancel(): void {
    this.cancelRequested = true;
  }

  async start(accountId: string, people: string[]): Promise<void> {
    if (this.running() || !people.length) {
      return;
    }
    this.cancelRequested = false;
    const ids = people.slice(0, CHECK_LIMIT);
    const followsYou = new Map<string, boolean>();
    const publish = (changes: Partial<DiscoveryCheckState>) =>
      this.state.update((s) => (s ? { ...s, followsYou: new Map(followsYou), ...changes } : s));
    this.state.set({
      phase: 'checking',
      accountId,
      checked: 0,
      total: ids.length,
      followsYou: new Map(),
    });
    try {
      for (let i = 0; i < ids.length; i += CHECK_BATCH) {
        if (this.cancelRequested) {
          publish({ phase: 'cancelled' });
          return;
        }
        const batch = ids.slice(i, i + CHECK_BATCH);
        for (const rel of await firstValueFrom(this.api.relationships(batch))) {
          followsYou.set(rel.id, rel.followed_by);
        }
        publish({ checked: i + batch.length });
      }
      publish({ phase: 'done' });
    } catch (error) {
      publish({ phase: 'failed', error: describeError(error) });
    }
  }
}
