/**
 * Whether the current viewer follows Eliza — a browser-local flag, per account.
 *
 * Eliza is not a real account, so "following" her can never go through the real
 * follow API (that would mutate the viewer's actual following list on
 * mastodon.social). Instead the relationship lives entirely in localStorage,
 * scoped per account via {@link scopedKey}, so an anonymous visitor and each
 * signed-in account each have their own independent relationship with her.
 *
 * This is the gate for the whole feature: her DM thread and the local-compose
 * replies (later sprints) only exist once {@link following} is true.
 */

import { Injectable, signal } from '@angular/core';
import { Relationship } from '../models';
import { scopedKey } from '../account-scope';
import { ELIZA_ID } from './eliza-identity';

const BASE_KEY = 'mockingbird_eliza_following';

function storageKey(): string {
  return scopedKey(BASE_KEY);
}

function read(): boolean {
  try {
    return localStorage.getItem(storageKey()) === '1';
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class ElizaFollow {
  /** Reactive follow state for the active account. */
  private readonly state = signal<boolean>(read());

  /** True if the viewer currently follows Eliza. */
  readonly following = this.state.asReadonly();

  /** Re-read from storage — call after an account switch changes the scope. */
  refresh(): void {
    this.state.set(read());
  }

  /** Start following Eliza (idempotent). */
  follow(): void {
    this.set(true);
  }

  /** Stop following Eliza (idempotent). */
  unfollow(): void {
    this.set(false);
  }

  /** Flip the follow state; returns the new value. */
  toggle(): boolean {
    const next = !this.state();
    this.set(next);
    return next;
  }

  private set(value: boolean): void {
    try {
      if (value) {
        localStorage.setItem(storageKey(), '1');
      } else {
        localStorage.removeItem(storageKey());
      }
    } catch {
      // Storage unavailable (private mode / quota): keep the in-memory value so
      // the session still behaves, it just won't persist across reloads.
    }
    this.state.set(value);
  }

  /** A synthetic {@link Relationship} describing the viewer ⇄ Eliza link, shaped
   *  like the one the profile page renders for real accounts. */
  relationship(): Relationship {
    const following = this.state();
    return {
      id: ELIZA_ID,
      following,
      // She "follows back" once you follow her — she's a friend, after all.
      followed_by: following,
      requested: false,
      blocking: false,
      muting: false,
      showing_reblogs: true,
    };
  }
}
