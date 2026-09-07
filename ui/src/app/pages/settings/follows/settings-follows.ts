import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../../api';
import { Account } from '../../../models';
import { Auth } from '../../../auth';
import { AnonymousFollow, AnonymousFollows } from '../../../providers/anonymous/anonymous-follows';
import { anonymousAccountRouteRef } from '../../../providers/anonymous/anonymous-route-ref';
import { TranslocoPipe } from '@jsverse/transloco';

/** Approve or reject pending follow requests. */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.follows.title: Approve follow requests
// i18n settings.follows.intro: Pending follow requests. Requests only appear when your account requires follow approval.
// i18n settings.follows.intro.anonymous: Accounts followed by Anonymous. Sources are fetched only when you explicitly load a feed.
// i18n settings.follows.crosslink.before: Looking to turn retweets on or off for everyone you follow?
// i18n settings.follows.crosslink.link: Bulk actions
// i18n settings.follows.crosslink.after: does that in one pass, and tells you how many accounts it would change before you agree.
// i18n settings.follows.empty: No pending follow requests.
// i18n settings.follows.empty.anonymous: You are not following any Mastodon accounts yet.
// i18n settings.follows.retry: Retry API
// i18n settings.follows.unfollow: Unfollow
// i18n settings.follows.accept: Accept
// i18n settings.follows.reject: Reject
// i18n common.loading: Loading…
@Component({
  selector: 'app-settings-follows',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './settings-follows.html',
  styleUrl: './settings-follows.css',
})
export class SettingsFollows implements OnInit {
  private api = inject(Api);
  protected auth = inject(Auth);
  protected anonymousFollows = inject(AnonymousFollows);

  protected requests = signal<Account[]>([]);
  protected loading = signal(false);

  ngOnInit(): void {
    if (this.auth.isAnonymous) {
      this.requests.set(this.anonymousFollows.follows().map((follow) => follow.account));
      return;
    }
    this.loading.set(true);
    this.api.followRequests().subscribe({
      next: (accounts) => {
        this.requests.set(accounts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected followFor(account: Account): AnonymousFollow | null {
    return (
      this.anonymousFollows
        .follows()
        .find(
          (follow) =>
            follow.account === account ||
            (follow.account.id === account.id && follow.account.acct === account.acct),
        ) ?? null
    );
  }

  protected accountLink(account: Account): (string | number)[] {
    const follow = this.followFor(account);
    return follow
      ? [
          '/accounts',
          anonymousAccountRouteRef({
            server: follow.readRef.server,
            id: follow.readRef.accountId,
            originalUrl: follow.profileUrl,
          }),
        ]
      : ['/accounts', account.id];
  }

  protected sourceStatus(follow: AnonymousFollow): string {
    const deferred = Object.entries(follow.routeRetryAfter)
      .filter(([, retryAfter]) => !!retryAfter && Date.parse(retryAfter) > Date.now())
      .map(([route]) => route);
    return deferred.length ? `Retrying around: ${deferred.join(', ')}` : 'Public API first';
  }

  retry(follow: AnonymousFollow): void {
    this.anonymousFollows.clearBackoff(follow.key);
  }

  unfollow(follow: AnonymousFollow): void {
    this.anonymousFollows.unfollow(follow.account, follow.server);
    this.requests.update((accounts) => accounts.filter((account) => account !== follow.account));
  }

  authorize(acc: Account): void {
    this.api.authorizeFollowRequest(acc.id).subscribe(() => {
      this.requests.update((list) => list.filter((a) => a.id !== acc.id));
    });
  }

  reject(acc: Account): void {
    this.api.rejectFollowRequest(acc.id).subscribe(() => {
      this.requests.update((list) => list.filter((a) => a.id !== acc.id));
    });
  }
}
