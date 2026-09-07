import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  concatMap,
  forkJoin,
  from,
  map,
  of,
  switchMap,
  throwError,
  toArray,
} from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { CollectionWithAccounts } from './models';

const CONVERSION_LIMIT = 25;

export interface ConversionResult {
  targetId: string;
  added: number;
  existing: number;
  failed: number;
  /**
   * True when at least one add failed *because the account is not followed*.
   *
   * Mastodon only keeps accounts you follow in a list, so converting a
   * collection of strangers adds nobody — and every failure used to be
   * flattened into an anonymous "skipped" count, which is why this reliably
   * looked broken. Knowing this specifically is what lets the page say "follow
   * them first" instead of shrugging.
   */
  needsFollow: boolean;
}

/** Idempotently copies the first 25 memberships between private lists and public collections. */
@Injectable({ providedIn: 'root' })
export class ListCollectionConverter {
  private api = inject(Api);
  private auth = inject(Auth);

  convertListToCollection(listId: string, title: string): Observable<ConversionResult> {
    const accountId = this.auth.account()?.id;
    if (!accountId) {
      return throwError(() => new Error('Sign in before converting a list.'));
    }
    return forkJoin({
      source: this.api.listAccounts(listId),
      collections: this.api.accountCollections(accountId),
    }).pipe(
      switchMap(({ source, collections }) => {
        const accountIds = unique(source.map((account) => account.id)).slice(0, CONVERSION_LIMIT);
        const existing = collections.find((collection) => collection.name === title);
        const target = existing
          ? this.api.getCollection(existing.id)
          : this.api.createCollection(title).pipe(
              map((wrapped) => {
                if (!wrapped.collection) {
                  throw new Error('The server did not return the new collection.');
                }
                return {
                  collection: wrapped.collection,
                  accounts: [],
                } satisfies CollectionWithAccounts;
              }),
            );
        return target.pipe(
          switchMap((data) =>
            this.addMissing(
              data.collection.id,
              accountIds,
              data.collection.items.flatMap((item) => (item.account_id ? [item.account_id] : [])),
              (targetId, accountIdToAdd) => this.api.addCollectionAccount(targetId, accountIdToAdd),
            ),
          ),
        );
      }),
    );
  }

  convertCollectionToList(data: CollectionWithAccounts): Observable<ConversionResult> {
    const accountIds = unique(
      data.collection.items.flatMap((item) => (item.account_id ? [item.account_id] : [])),
    ).slice(0, CONVERSION_LIMIT);
    return this.api.lists().pipe(
      switchMap((lists) => {
        const existing = lists.find((list) => list.title === data.collection.name);
        const target = existing ? of(existing) : this.api.createList(data.collection.name);
        return target.pipe(
          switchMap((list) =>
            this.api.listAccounts(list.id).pipe(
              switchMap((members) =>
                this.addMissing(
                  list.id,
                  accountIds,
                  members.map((account) => account.id),
                  (targetId, accountId) => this.api.addToList(targetId, accountId),
                ),
              ),
            ),
          ),
        );
      }),
    );
  }

  private addMissing(
    targetId: string,
    sourceIds: string[],
    existingIds: string[],
    add: (targetId: string, accountId: string) => Observable<unknown>,
  ): Observable<ConversionResult> {
    const existing = new Set(existingIds);
    const missing = sourceIds.filter((id) => !existing.has(id));
    return from(missing).pipe(
      concatMap((id) =>
        add(targetId, id).pipe(
          map(() => 'ok' as const),
          // The status is kept rather than collapsed to a boolean: 422 here
          // means "you don't follow them", which is the difference between a
          // mystery and an instruction.
          catchError((error: unknown) => of(notFollowedError(error) ? 'unfollowed' : 'failed')),
        ),
      ),
      toArray(),
      map((results) => ({
        targetId,
        added: results.filter((result) => result === 'ok').length,
        existing: sourceIds.length - missing.length,
        failed: results.filter((result) => result !== 'ok').length,
        needsFollow: results.some((result) => result === 'unfollowed'),
      })),
    );
  }
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Did adding this account fail because we don't follow them?
 *
 * Mastodon answers 422 for that, which it also uses for other validation
 * failures — so this is a strong hint rather than a certainty, and the copy it
 * drives is phrased as one ("most servers only keep accounts you follow").
 */
function notFollowedError(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 422;
}
