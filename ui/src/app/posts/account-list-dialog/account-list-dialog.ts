import { AccountName } from '../../accounts/account-name';
import { accountProfilePath } from '../../accounts/account-route';
import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { map, Observable, switchMap } from 'rxjs';
import { Api } from '../../platform/api/api';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { adaptAuthor } from '../../connections/bluesky/bluesky-adapter';
import { Account, Status } from '../../platform/api/models';
import { OriginReads } from '../../reading/origin/origin-reads';
import { Terminology } from '../../i18n/terminology';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';

// i18n accountList.favouritedBy: Favourited by
// i18n accountList.loading: Loading…
// i18n accountList.empty: Nobody yet.
// i18n accountList.close: Close
// i18n accountList.failed: Could not load accounts. Try again.
// i18n accountList.retry: Retry
// i18n accountList.fromServer: From {{server}}

/** Which set of accounts to show for a status. */
export type AccountListMode = 'favourited_by' | 'reblogged_by';

/**
 * A modal listing the accounts that favourited or boosted a status: from the
 * Mastodon server, or from Bluesky when the post is a Bluesky one.
 */
@Component({
  selector: 'app-account-list-dialog',
  imports: [AccountName, MbDialog, MbButton, MbContentState, RouterLink, TranslocoPipe],
  templateUrl: './account-list-dialog.html',
  styleUrl: './account-list-dialog.css',
})
export class AccountListDialog implements OnInit {
  protected readonly accountProfilePath = accountProfilePath;
  private api = inject(Api);
  private bskyApi = inject(BlueskyApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusId = input.required<string>();
  readonly mode = input.required<AccountListMode>();
  /** The Bluesky post's at-uri. Set, the lists come from Bluesky instead of the server. */
  readonly blueskyUri = input<string | null>(null);
  /**
   * The post itself, so a remote post's list can be read from its own server
   * when the reader turned that on (parity item 8). Null keeps the home list.
   */
  readonly status = input<Pick<Status, 'uri' | 'url'> | null>(null);
  readonly closed = output<void>();
  /** Set when the list came from the post's own server. */
  protected fromServer = signal<string | null>(null);
  private origin = inject(OriginReads);

  protected accounts = signal<Account[]>([]);
  protected loading = signal(false);
  protected failed = signal(false);

  private words = inject(Terminology).words;
  private readonly i18n = inject(TranslocoService);

  protected get title(): string {
    return this.mode() === 'favourited_by'
      ? this.i18n.translate('accountList.favouritedBy')
      : this.words().BoostedBy;
  }

  ngOnInit(): void {
    this.load();
  }

  private accounts$(): Observable<Account[]> {
    const uri = this.blueskyUri();
    const liked = this.mode() === 'favourited_by';
    if (uri) {
      return liked
        ? this.bskyApi
            .getLikes(uri)
            .pipe(map((page) => page.likes.map((like) => adaptAuthor(like.actor))))
        : this.bskyApi.getRepostedBy(uri).pipe(map((page) => page.repostedBy.map(adaptAuthor)));
    }
    const home = (): Observable<Account[]> =>
      liked ? this.api.favouritedBy(this.statusId()) : this.api.rebloggedBy(this.statusId());
    const status = this.status();
    if (!status || !this.origin.originOfStatus(status)) return home();
    // The origin's list is the complete one; any failure falls back to home, quietly.
    return this.origin.statusAccounts(status, liked ? 'favourited_by' : 'reblogged_by').pipe(
      switchMap((found) => {
        this.fromServer.set(found?.server ?? null);
        return found ? [found.accounts] : home();
      }),
    );
  }

  protected load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    const call: Observable<Account[]> = this.accounts$();
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }
}
