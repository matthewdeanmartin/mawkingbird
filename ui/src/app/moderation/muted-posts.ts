import { Injectable, signal } from '@angular/core';

const STORE_KEY = 'mockingbird_muted_posts';
const MUTE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Client-side per-post mutes: "I never want to see this post again (for a
 * while)". Mastodon has no server-side per-post hide — the closest thing,
 * `POST /statuses/:id/mute`, only silences the thread's notifications — so
 * this lives in localStorage: status id → expiry timestamp, 30 days out.
 * Works against any instance; expired entries purge on startup.
 */
@Injectable({ providedIn: 'root' })
export class MutedPosts {
  /** id → epoch-ms expiry. Signal so cards re-evaluate when a mute lands. */
  readonly muted = signal<Record<string, number>>(load());

  isMuted(statusId: string): boolean {
    return (this.muted()[statusId] ?? 0) > Date.now();
  }

  mute(statusId: string): void {
    this.muted.update((map) => {
      const next = { ...map, [statusId]: Date.now() + MUTE_MS };
      save(next);
      return next;
    });
  }

  unmute(statusId: string): void {
    this.muted.update((map) => {
      const next = { ...map };
      delete next[statusId];
      save(next);
      return next;
    });
  }
}

function load(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, number>;
    const now = Date.now();
    const alive = Object.fromEntries(
      Object.entries(raw).filter(([, expiry]) => typeof expiry === 'number' && expiry > now),
    );
    if (Object.keys(alive).length !== Object.keys(raw).length) {
      save(alive);
    }
    return alive;
  } catch {
    return {};
  }
}

function save(map: Record<string, number>): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(map));
}
