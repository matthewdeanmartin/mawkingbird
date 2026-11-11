import { computed, inject, Injectable, signal } from '@angular/core';
import { HugoApiError, HugoContents } from './hugo-contents';
import {
  DEPLOY_CEILING_MS,
  DeployState,
  isTerminal,
  nextDeployState,
  pollDelayMs,
} from './hugo-deploy';

/**
 * Watches one commit until its build finishes, then stops.
 *
 * "Then stops" is the whole design constraint. Every one of these ends the
 * poll: a terminal verdict, the ceiling, a second publish superseding the
 * first, and {@link stop} (which the UI calls on destroy). A publish followed
 * by navigating away must not leave a timer running, and a build that never
 * resolves must not poll forever — five minutes of 15-second polls is the most
 * this will ever spend on one post.
 *
 * Deliberately *not* wired into publishing. A failed watch must never make a
 * successful commit look failed, so the composer publishes first, emits its
 * Status, and only then hands the commit sha here to be watched.
 */
@Injectable({ providedIn: 'root' })
export class HugoDeployWatch {
  private readonly contents = inject(HugoContents);

  private readonly state = signal<DeployState | null>(null);
  /** The current verdict, or null when nothing is being watched. */
  readonly current = this.state.asReadonly();
  readonly watching = computed(() => {
    const state = this.state();
    return state !== null && !isTerminal(state);
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Identifies the watch in flight.
   *
   * Every scheduled callback checks it before touching state, so a superseded
   * watch cannot resurrect itself after `stop()` or after a newer publish took
   * over — the classic way a "stopped" poller keeps writing.
   */
  private token = 0;

  /** Begin watching a commit. Any previous watch is abandoned. */
  watch(commitSha: string): void {
    this.stop();
    if (!commitSha) {
      // A commit we cannot identify cannot be matched to a run, and guessing
      // from "the newest run" is exactly the wrong answer.
      this.state.set(null);
      return;
    }
    const token = ++this.token;
    const startedAt = Date.now();
    this.state.set({ kind: 'queued' });
    this.schedule(token, commitSha, startedAt, 0);
  }

  /** Stop watching and clear the verdict. */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Invalidate anything already in flight; a resolved fetch must not write.
    this.token++;
    this.state.set(null);
  }

  private schedule(token: number, commitSha: string, startedAt: number, attempt: number): void {
    this.timer = setTimeout(() => {
      void this.poll(token, commitSha, startedAt, attempt);
    }, pollDelayMs(attempt));
  }

  private async poll(
    token: number,
    commitSha: string,
    startedAt: number,
    attempt: number,
  ): Promise<void> {
    if (token !== this.token) {
      return;
    }
    let next: DeployState;
    try {
      const runs = await this.contents.recentRuns();
      next = nextDeployState(runs, commitSha, Date.now() - startedAt);
    } catch (error: unknown) {
      // A token without `Actions: read` is the common case here, and it must
      // never look like a failed publish — the commit already succeeded.
      next = {
        kind: 'unknown',
        reason:
          error instanceof HugoApiError && (error.status === 403 || error.status === 404)
            ? 'Committed. Add "Actions: Read-only" to your token to see build status here.'
            : 'Committed. Could not reach GitHub to check the build status.',
      };
    }
    if (token !== this.token) {
      return;
    }

    if (isTerminal(next)) {
      this.timer = null;
      this.state.set(next);
      return;
    }
    if (Date.now() - startedAt >= DEPLOY_CEILING_MS) {
      this.timer = null;
      this.state.set({
        kind: 'unknown',
        reason: 'Still building after five minutes — check the run on GitHub.',
      });
      return;
    }
    this.state.set(next);
    this.schedule(token, commitSha, startedAt, attempt + 1);
  }
}
