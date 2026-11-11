import { accountProfilePath } from '../../accounts/account-route';
import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { map, Observable } from 'rxjs';
import { Api } from '../../platform/api/api';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { adaptAuthor } from '../../connections/bluesky/bluesky-adapter';
import { Account } from '../../platform/api/models';
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

/** Which set of accounts to show for a status. */
export type AccountListMode = 'favourited_by' | 'reblogged_by';

/**
 * A modal listing the accounts that favourited or boosted a status: from the
 * Mastodon server, or from Bluesky when the post is a Bluesky one.
 */
@Component({
  selector: 'app-account-list-dialog',
  imports: [MbDialog, MbButton, MbContentState, RouterLink, TranslocoPipe],
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
  readonly closed = output<void>();

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
    return liked ? this.api.favouritedBy(this.statusId()) : this.api.rebloggedBy(this.statusId());
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
