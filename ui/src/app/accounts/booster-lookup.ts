import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, Subscription, catchError, from, mergeMap, of, tap, throwError } from 'rxjs';
import { Api } from '../platform/api/api';
import { Account, Status } from '../platform/api/models';
import { AnonymousPublicApi } from './anonymous/anonymous-public-api';
import { AnonymousPublicRef } from './anonymous/anonymous-route-ref';
import { Booster } from './reach-model';

/** Most `reblogged_by` calls one refine click may spend. */
export const REFINE_CALL_BUDGET = 40;
/** Requests in flight at once; kept low so a refine never floods a server. */
const PARALLEL = 2;

export type RefineEnd = 'done' | 'cancelled' | 'rateLimited';

export interface RefineRun {
  /** Calls this run planned. */
  total: number;
  /** Calls answered so far, successful or not. */
  finished: number;
  /** Null while the run is going. */
  ended: RefineEnd | null;
}

/**
 * Who boosted which status, for Full reach.
 *
 * Asking costs one `reblogged_by` call per post, so nothing here runs on its
 * own: a page calls {@link refine} from a button that names the cost. Answers
 * are kept for the session and shared, so the account page and the post page
 * never pay twice for the same post. One page (up to 80 boosters) per post;
 * boosts beyond that fall back to the typical booster audience in the model.
 */
@Injectable({ providedIn: 'root' })
export class BoosterLookup {
  private api = inject(Api);
  private anonymous = inject(AnonymousPublicApi);

  private readonly cache = signal<ReadonlyMap<string, readonly Booster[]>>(new Map());
  /** Statuses whose server refused the list (hidden, deleted, sign-in only). Not retried. */
  private readonly refused = new Set<string>();
  readonly run = signal<RefineRun | null>(null);
  private subscription: Subscription | null = null;

  /** Known boosters of a status, or null when nobody has asked yet. Reactive. */
  readonly boostersOf = (status: Status): readonly Booster[] | null =>
    this.cache().get(status.id) ?? null;

  /** Boosted statuses not looked up yet, most-boosted first. */
  pending(statuses: readonly Status[]): Status[] {
    const cache = this.cache();
    return statuses
      .filter(
        (s) =>
          s.reblog == null && s.reblogs_count > 0 && !cache.has(s.id) && !this.refused.has(s.id),
      )
      .sort((a, b) => b.reblogs_count - a.reblogs_count);
  }

  /** How many calls a refine of these statuses would spend now. */
  cost(statuses: readonly Status[]): number {
    return Math.min(REFINE_CALL_BUDGET, this.pending(statuses).length);
  }

  /**
   * Look up the boosters of up to {@link REFINE_CALL_BUDGET} statuses. With a
   * `publicRef`, statuses are read anonymously from that server; otherwise
   * from the signed-in home server. Stops on the first 429 and keeps what it
   * has; a post whose server refuses the list is skipped and not retried.
   */
  refine(statuses: readonly Status[], publicRef: AnonymousPublicRef | null = null): void {
    if (this.run() && this.run()!.ended === null) return;
    const batch = this.pending(statuses).slice(0, REFINE_CALL_BUDGET);
    this.run.set({ total: batch.length, finished: 0, ended: batch.length ? null : 'done' });
    if (!batch.length) return;
    this.subscription = from(batch)
      .pipe(
        mergeMap(
          (status) =>
            this.fetch(status, publicRef).pipe(
              tap((accounts) => this.store(status.id, accounts)),
              // One refused post does not end the run; a rate limit does.
              catchError((err: unknown) => {
                if (isRateLimit(err)) return throwError(() => err);
                this.refused.add(status.id);
                return of(null);
              }),
            ),
          PARALLEL,
        ),
      )
      .subscribe({
        next: () => this.advance(),
        // Only a rate limit reaches here; other failures were absorbed per post.
        error: () => this.end('rateLimited'),
        complete: () => this.end('done'),
      });
  }

  cancel(): void {
    if (this.run()?.ended === null) this.end('cancelled');
  }

  private fetch(status: Status, publicRef: AnonymousPublicRef | null): Observable<Account[]> {
    if (!publicRef) return this.api.rebloggedBy(status.id, 80);
    const ref = status.providerRef as { statusId?: unknown } | undefined;
    const id = typeof ref?.statusId === 'string' ? ref.statusId : status.id;
    return this.anonymous.getRebloggedBy({ server: publicRef.server, id });
  }

  private store(id: string, accounts: Account[]): void {
    const boosters = accounts.map((a) => ({ id: a.id, followers_count: a.followers_count ?? 0 }));
    this.cache.update((m) => new Map(m).set(id, boosters));
  }

  private advance(): void {
    this.run.update((r) => (r ? { ...r, finished: r.finished + 1 } : r));
  }

  private end(ended: RefineEnd): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.run.update((r) => (r ? { ...r, ended } : r));
  }
}

function isRateLimit(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 429;
}
