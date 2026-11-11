import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { ServerRole } from './server-role';

/**
 * Which non-home capabilities are currently unreachable.
 *
 * The counterpart to `ServerHealth`: that one owns the single question "is the
 * app usable at all", this one owns "which parts are missing right now". Keeping
 * them apart is the whole point — the fail whale's claim ("can't reach the
 * server") is *false* when the timeline is fine and only the emoji list failed,
 * and shipping that lie is what made the whale feel like noise.
 *
 * Nothing here blocks the UI. A degraded role is a fact a page can mention where
 * the feature would have been, and otherwise ignore.
 *
 * `peer` deserves special mention: an anonymous feed reads dozens of other
 * people's instances per refresh, and one of them being blocked, rate-limited or
 * simply gone is ordinary. Those failures are counted rather than announced —
 * Feed Doctor is where they belong, attached to the follow they concern.
 */

export interface DegradedRole {
  role: ServerRole;
  /** Path of the request that failed — enough to place it. */
  url: string;
  at: Date;
}

@Injectable({ providedIn: 'root' })
export class ServerDegradation {
  private state = signal<Partial<Record<ServerRole, DegradedRole>>>({});

  /** Roles currently known to be failing. */
  readonly degraded = computed(() => Object.values(this.state()) as DegradedRole[]);

  isDegraded(role: ServerRole): boolean {
    return !!this.state()[role];
  }

  markDown(role: ServerRole, err?: HttpErrorResponse): void {
    // Peers fail individually and constantly; a single dead follow is not a
    // statement about the app's health and must not become one.
    if (role === 'peer' || role === 'home') {
      return;
    }
    if (this.state()[role]) {
      return;
    }
    this.state.set({
      ...this.state(),
      [role]: { role, url: pathOf(err?.url ?? null), at: new Date() },
    });
  }

  /** A success proves the role works again. */
  markUp(role: ServerRole): void {
    if (!this.state()[role]) {
      return;
    }
    const next = { ...this.state() };
    delete next[role];
    this.state.set(next);
  }

  /** Forget everything — used when the active account or instance changes. */
  reset(): void {
    this.state.set({});
  }
}

function pathOf(url: string | null): string {
  if (!url) {
    return '(unknown request)';
  }
  try {
    const parsed = new URL(url, location.origin);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}
