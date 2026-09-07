import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { concatMap, from, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Api } from '../api';
import { Auth } from '../auth';
import { PageDiagnostics, statusOf } from '../page-diagnostics';
import { Account, SearchResults } from '../models';
import { AnonymousAccount } from '../providers/anonymous/anonymous-account';
import { AnonymousFollows } from '../providers/anonymous/anonymous-follows';
import { AnonymousLists } from '../providers/anonymous/anonymous-lists';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { FocusTrap } from '../a11y/focus-trap';

/** One line of the bulk add-by-name result. */
interface BulkResult {
  handle: string;
  status: 'added' | 'notfound' | 'error';
}

/**
 * Bulk "add people by name" into a single, already-known target (the list or
 * collection whose page hosts this dialog). Paste one handle, a CSV, or one
 * handle per line; each is resolved via search and added sequentially.
 */
// i18n bulkAdd.dialogAria: Add people by name
// i18n bulkAdd.heading.list: Add people to list “{{name}}”
// i18n bulkAdd.heading.collection: Add people to collection “{{name}}”
// i18n bulkAdd.heading.listNoName: Add people to list
// i18n bulkAdd.heading.collectionNoName: Add people to collection
// i18n bulkAdd.instructions: Paste handles separated by commas, spaces, or line breaks. Each is resolved and added, one after another.
// i18n bulkAdd.done: Done
// i18n bulkAdd.cancel: Cancel
// i18n bulkAdd.adding: Adding…
// i18n bulkAdd.addCount.one: Add {{count}} person
// i18n bulkAdd.addCount.other: Add {{count}} people
// i18n bulkAdd.status.added: added
// i18n bulkAdd.status.notfound: notfound
// i18n bulkAdd.status.error: error
@Component({
  selector: 'app-bulk-add-dialog',
  imports: [FocusTrap, FormsModule, TranslocoPipe],
  templateUrl: './bulk-add-dialog.html',
  styleUrl: './bulk-add-dialog.css',
})
export class BulkAddDialog {
  private api = inject(Api);
  private auth = inject(Auth);
  private diagnostics = inject(PageDiagnostics);
  private anonymous = inject(AnonymousAccount);
  private anonymousFollows = inject(AnonymousFollows);
  private anonymousLists = inject(AnonymousLists);
  private anonymousPublic = inject(AnonymousPublicApi);
  private transloco = inject(TranslocoService);

  readonly targetId = input.required<string>();
  readonly targetKind = input.required<'list' | 'collection'>();
  /** Display name for the heading (list title / collection name). */
  readonly targetName = input<string>('');
  /** Fires with the number of accounts successfully added, once, on finish. */
  readonly added = output<number>();
  readonly closed = output<void>();

  protected handles = signal('');
  protected busy = signal(false);
  protected results = signal<BulkResult[]>([]);

  /** Split a paste into handles: comma, newline, or whitespace separated. */
  protected parseHandles(raw: string): string[] {
    return raw
      .split(/[\s,]+/)
      .map((h) => h.replace(/^@/, ''))
      .filter((h) => h.length > 0);
  }

  protected count(): number {
    return this.parseHandles(this.handles()).length;
  }

  protected statusLabel(status: BulkResult['status']): string {
    return this.transloco.translate(`bulkAdd.status.${status}`);
  }

  add(): void {
    const handles = this.parseHandles(this.handles());
    if (!handles.length || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.results.set([]);

    const context = {
      handles: handles.length,
      targetId: this.targetId(),
      targetKind: this.targetKind(),
      anonymous: this.auth.isAnonymous,
    };
    this.diagnostics.info('Lists', 'bulk-add:start', context);

    from(handles)
      .pipe(concatMap((handle) => this.resolveAndAdd(handle)))
      .subscribe({
        next: (result) => this.results.update((r) => [...r, result]),
        complete: () => {
          this.busy.set(false);
          const rows = this.results();
          const added = rows.filter((r) => r.status === 'added').length;
          // The counts are the point of this line: on a long list the per-row
          // outcomes scroll past, and "42 of 50, 3 not found, 5 failed" is what
          // tells you whether the run did what you asked.
          this.diagnostics.info('Lists', 'bulk-add:finish', {
            ...context,
            added,
            notFound: rows.filter((r) => r.status === 'notfound').length,
            failed: rows.filter((r) => r.status === 'error').length,
          });
          this.added.emit(added);
        },
        // resolveAndAdd catches per-handle failures, so reaching here means the
        // batch itself broke — worth distinguishing from a handle that failed.
        error: (error) => {
          this.diagnostics.error('Lists', 'bulk-add:batch-error', error, {
            ...context,
            completed: this.results().length,
          });
          this.busy.set(false);
        },
      });
  }

  /**
   * Resolve one handle to an account and add it; never errors the outer stream.
   *
   * Each `catchError` here converts a failure into a result row so one bad
   * handle doesn't abort the rest of the batch. That swallowing is deliberate,
   * but it used to be total: the error object was discarded unexamined, so a
   * 503 from the instance and a handle that genuinely doesn't exist both
   * produced an identical "error" row and nothing in the console. The rows
   * still read the same to keep the batch behaviour; the log now tells them
   * apart, including which step failed.
   */
  private resolveAndAdd(handle: string): Observable<BulkResult> {
    return this.search(handle).pipe(
      switchMap((res) => {
        const account = res.accounts[0];
        if (!account) {
          this.diagnostics.warn('Lists', 'bulk-add:not-found', {
            handle,
            targetId: this.targetId(),
          });
          return of<BulkResult>({ handle, status: 'notfound' });
        }
        return this.addAccount(account, handle).pipe(
          map(() => {
            this.diagnostics.info('Lists', 'bulk-add:added', {
              handle,
              accountId: account.id,
              targetId: this.targetId(),
            });
            return { handle, status: 'added' } as BulkResult;
          }),
          catchError((error: unknown) => {
            this.diagnostics.error('Lists', 'bulk-add:add-error', error, {
              handle,
              accountId: account.id,
              targetId: this.targetId(),
              targetKind: this.targetKind(),
              status: statusOf(error),
            });
            return of<BulkResult>({ handle, status: 'error' });
          }),
        );
      }),
      // Reached when the *search* failed, so we never got as far as an account.
      catchError((error: unknown) => {
        this.diagnostics.error('Lists', 'bulk-add:resolve-error', error, {
          handle,
          targetId: this.targetId(),
          status: statusOf(error),
        });
        return of<BulkResult>({ handle, status: 'error' });
      }),
    );
  }

  private search(handle: string): Observable<SearchResults> {
    return this.auth.isAnonymous
      ? this.anonymousPublic.search(this.serverFor(handle), handle.split('@')[0], 'accounts')
      : this.api.search(handle, 'accounts', { resolve: true, limit: 1 });
  }

  /**
   * Add one resolved account to the target.
   *
   * Local failures come back as `throwError`, not a bare `throw`. A synchronous
   * throw here escapes the *inner* catchError (it happens while building the
   * observable, not while running it) and lands in the outer one, which would
   * report an anonymous-mode failure as though the handle couldn't be resolved
   * — pointing anyone reading the log at the wrong step entirely.
   */
  private addAccount(account: Account, handle: string): Observable<unknown> {
    if (!this.auth.isAnonymous) {
      return this.targetKind() === 'list'
        ? this.api.addToList(this.targetId(), account.id)
        : this.api.addCollectionAccount(this.targetId(), account.id);
    }
    if (this.targetKind() !== 'list') {
      return throwError(() => new Error('Anonymous collections are read-only.'));
    }
    const result = this.anonymousFollows.follow(account, this.serverFor(handle));
    const follow = this.anonymousFollows.findByAccountId(account.id);
    if (!result.ok || !follow) {
      return throwError(() => new Error(result.ok ? 'Could not save the account.' : result.error));
    }
    this.anonymousLists.setMember(this.targetId(), follow.key, true);
    return of({});
  }

  private serverFor(handle: string): string {
    const host = handle.includes('@') ? handle.split('@').at(-1) : null;
    return host ? `https://${host}` : this.anonymous.server();
  }
}
