import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, Observable, of, Subscription, timeout } from 'rxjs';
import { NgOptimizedImage } from '@angular/common';
import { Api } from '../../api';
import { ClientPrefs } from '../../client-prefs';
import { Account, MastodonNotification, Relationship, Status } from '../../models';
import { Streaming } from '../../streaming';
import { AccountListDialog, AccountListMode } from '../../account-list-dialog/account-list-dialog';
import { AccountResultCard } from '../search/account-result-card';
import { AccountWithMatches } from '../search/account-refine';
import { PageDiagnostics } from '../../page-diagnostics';
import { Auth } from '../../auth';
import { BlueskyNotifications } from '../../providers/bluesky/bluesky-notifications';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

type NotifAudience = 'all' | 'friends' | 'followers';
type NotificationView = 'notifications' | 'new-accounts';

/** Each network keeps its own cursor; rows can be merged by creation time. */
export type NotificationSource = 'all' | 'mastodon' | 'bluesky';

export interface NewAccountCandidate {
  account: Account;
  relationship: Relationship;
  notification: MastodonNotification;
  notificationCount: number;
}

/** English source strings; see scripts/extract-i18n.mjs. */
// i18n pages.notifications.sourceAriaLabel: Notification source
// i18n pages.notifications.source.mastodon: 🐘 Mastodon
// i18n pages.notifications.source.bluesky: 🦋 Bluesky
// i18n pages.notifications.source.all: Both
// i18n pages.notifications.mastodonLoadFailed: Could not load Mastodon notifications. Try refreshing.
// i18n pages.notifications.viewAriaLabel: Notification view
// i18n pages.notifications.notifications: Notifications
// i18n pages.notifications.newAccounts: Accounts New to Me
// i18n pages.notifications.audience.from: From
// i18n pages.notifications.audience.all: All
// i18n pages.notifications.audience.friends: Friends
// i18n pages.notifications.audience.followers: Followers
// i18n pages.notifications.type.title: Notification type
// i18n pages.notifications.type.all: All types
// i18n pages.notifications.live.title: Live: new notifications stream in as they arrive. Turn off in Blue → Auto-refresh timeline.
// i18n pages.notifications.live.label: ● Live
// i18n pages.notifications.refresh.title: Check for new notifications
// i18n pages.notifications.refresh.label: ↻ Refresh
// i18n pages.notifications.loading: Loading…
// i18n pages.notifications.empty: No notifications yet.
// i18n pages.notifications.checkingAccounts: Checking which accounts are new to you…
// i18n pages.notifications.relationshipCheckFailed: Couldn’t check account relationships. Try this view again.
// i18n pages.notifications.noUnfamiliarAccounts: No unfamiliar accounts in the notifications loaded so far.
// i18n pages.notifications.noMatch: No notifications match the filters.
// i18n pages.notifications.seeEveryone: {{type}} — see everyone
// i18n pages.notifications.openChat: 💬 Open in chat
// i18n pages.notifications.viewThread: 🧵 View thread
// i18n pages.notifications.caughtUp: You're all caught up.
// i18n pages.notifications.loadMore: Load more
// i18n pages.notifications.bskyNotLinked: Link a Bluesky account in Settings → Connections to see its notifications.
// i18n pages.notifications.bskyLoadFailed: Could not load Bluesky notifications.
// i18n pages.notifications.reason.likedPost: liked your post
// i18n pages.notifications.reason.boostedPost: boosted your post
// i18n pages.notifications.reason.replied: replied to you
// i18n pages.notifications.reason.mentioned: mentioned you
// i18n pages.notifications.reason.followed: followed you
// i18n pages.notifications.reason.more.one: {{base}} · {{count}} more recent notification
// i18n pages.notifications.reason.more.other: {{base}} · {{count}} more recent notifications
// i18n pages.notifications.followFailed: Could not follow @{{acct}}.
// i18n pages.notifications.muteFailed: Could not mute @{{acct}}.
// i18n pages.notifications.blockFailed: Could not block @{{acct}}.
// i18n pages.notifications.others.one: and {{count}} other
// i18n pages.notifications.others.other: and {{count}} others
// i18n pages.notifications.label.favourite: favourited your status
// i18n pages.notifications.label.reblog: boosted your status
// i18n pages.notifications.label.follow: followed you
// i18n pages.notifications.label.mention: mentioned you

function normalizedAccountUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '').toLocaleLowerCase();
  } catch {
    return null;
  }
}

/** Compare two accounts as identities from the current Mastodon server. */
export function isSameAccount(candidate: Account, self: Account | null): boolean {
  if (!self) return false;
  if (candidate.id && self.id && candidate.id === self.id) return true;

  const candidateUrl = normalizedAccountUrl(candidate.url);
  const selfUrl = normalizedAccountUrl(self.url);
  if (candidateUrl && selfUrl && candidateUrl === selfUrl) return true;

  const candidateAcct = candidate.acct.replace(/^@/, '').toLocaleLowerCase();
  const selfAcct = self.acct.replace(/^@/, '').toLocaleLowerCase();
  if (candidateAcct.includes('@') && selfAcct.includes('@')) return candidateAcct === selfAcct;

  // Mastodon commonly returns the current account's acct as just "alice" but
  // notification actors as "alice@example.social". Qualify the local form
  // from its profile URL before comparing.
  const candidateHost = candidateUrl ? new URL(candidateUrl).host : null;
  const selfHost = selfUrl ? new URL(selfUrl).host : null;
  const qualifiedCandidate = candidateAcct.includes('@')
    ? candidateAcct
    : candidateHost
      ? `${candidate.username.toLocaleLowerCase()}@${candidateHost}`
      : candidateAcct;
  const qualifiedSelf = selfAcct.includes('@')
    ? selfAcct
    : selfHost
      ? `${self.username.toLocaleLowerCase()}@${selfHost}`
      : selfAcct;
  return qualifiedCandidate === qualifiedSelf;
}

/** Collapse buckets only once they outgrow this many distinct people. */
export const GROUP_THRESHOLD = 3;

export type NotifRow =
  | { kind: 'single'; key: string; notif: MastodonNotification }
  | {
      kind: 'group';
      key: string;
      type: string;
      status: Status;
      /** First few distinct accounts, for the stacked avatars / name line. */
      sample: MastodonNotification[];
      /** Distinct accounts in the bucket (one person twice counts once). */
      count: number;
    };

/**
 * Group notifications that point at the same status (100 boosts of one post
 * read as one row, not 100). Mentions stay individual — each reply is its own
 * conversation — as do types without a status (follow, admin reports…).
 * Buckets at or under the threshold stay expanded in place; a collapsed group
 * takes its newest member's position, so the list stays newest-first.
 */
export function groupNotifications(
  list: MastodonNotification[],
  threshold = GROUP_THRESHOLD,
): NotifRow[] {
  const buckets = new Map<string, MastodonNotification[]>();
  for (const n of list) {
    if (n.type === 'mention' || !n.status) {
      continue;
    }
    const key = `${n.type}:${n.status.id}`;
    buckets.set(key, [...(buckets.get(key) ?? []), n]);
  }

  const rows: NotifRow[] = [];
  const emitted = new Set<string>();
  for (const n of list) {
    const key = n.type === 'mention' || !n.status ? null : `${n.type}:${n.status.id}`;
    const bucket = key ? buckets.get(key)! : null;
    if (!key || !bucket) {
      rows.push({ kind: 'single', key: `n:${n.id}`, notif: n });
      continue;
    }
    const distinct = dedupeByAccount(bucket);
    if (distinct.length <= threshold) {
      rows.push({ kind: 'single', key: `n:${n.id}`, notif: n });
      continue;
    }
    if (emitted.has(key)) {
      continue; // already collapsed at the newest member's position
    }
    emitted.add(key);
    rows.push({
      kind: 'group',
      key: `g:${key}`,
      type: n.type,
      status: n.status!,
      sample: distinct.slice(0, 3),
      count: distinct.length,
    });
  }
  return rows;
}

function dedupeByAccount(bucket: MastodonNotification[]): MastodonNotification[] {
  const seen = new Set<string>();
  const out: MastodonNotification[] = [];
  for (const n of bucket) {
    if (!seen.has(n.account.id)) {
      seen.add(n.account.id);
      out.push(n);
    }
  }
  return out;
}

/** One newest notification per unfamiliar account, preserving notification order. */
export function accountsNewToMe(
  notifications: MastodonNotification[],
  relationships: ReadonlyMap<string, Relationship>,
  dismissed: ReadonlySet<string> = new Set(),
  self: Account | null = null,
): NewAccountCandidate[] {
  const candidates = new Map<string, NewAccountCandidate>();
  for (const notification of notifications) {
    const id = notification.account.id;
    const relationship = relationships.get(id);
    if (
      isSameAccount(notification.account, self) ||
      !relationship ||
      relationship.following ||
      relationship.requested ||
      relationship.blocking ||
      relationship.muting ||
      dismissed.has(id)
    ) {
      continue;
    }
    const existing = candidates.get(id);
    if (existing) {
      existing.notificationCount += 1;
    } else {
      candidates.set(id, {
        account: notification.account,
        relationship,
        notification,
        notificationCount: 1,
      });
    }
  }
  return [...candidates.values()];
}

@Component({
  selector: 'app-notifications',
  imports: [
    RouterLink,
    FormsModule,
    AccountListDialog,
    NgOptimizedImage,
    AccountResultCard,
    TranslocoPipe,
  ],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
})
export class Notifications implements OnInit, OnDestroy {
  private api = inject(Api);
  private streaming = inject(Streaming);
  private prefs = inject(ClientPrefs);
  private diagnostics = inject(PageDiagnostics);
  private auth = inject(Auth);
  private bskyNotifications = inject(BlueskyNotifications);
  protected bskySession = inject(BlueskySession);
  private transloco = inject(TranslocoService);
  protected mastodonAvailable = computed(() => !!this.auth.token());

  /** Media thumbnails respect the feed-wide images on/off preference. */
  protected showImages = this.prefs.showImages;

  protected source = signal<NotificationSource>('mastodon');
  /** Bluesky's opaque paging cursor; null before the first page or once done. */
  private bskyCursor: string | null = null;
  private mastodonCursor: string | undefined;
  private mastodonDone = false;
  private bskyDone = false;
  private pageSub: Subscription | null = null;
  protected mastodonError = signal<string | null>(null);
  /** Why the Bluesky list is empty, when it is empty for a reason. */
  protected bskyError = signal<string | null>(null);

  protected items = signal<MastodonNotification[]>([]);
  protected loading = signal(true);
  protected live = signal(false);
  protected loadingMore = signal(false);
  /** An empty older page came back: the history is fully loaded. */
  protected exhausted = signal(false);

  // List filters: who the notification is from, and what kind it is.
  protected audience = signal<NotifAudience>('all');
  protected typeFilter = signal<string>('all');
  protected view = signal<NotificationView>('notifications');

  /** Relationships for the friends/followers filters; fetched lazily. */
  private rels = signal<Map<string, Relationship>>(new Map());
  private requestedRels = new Set<string>();
  protected relationshipChecksPending = signal(0);
  protected relationshipCheckFailed = signal(false);
  private dismissedAccounts = signal<Set<string>>(new Set());
  protected accountActionBusy = signal<Set<string>>(new Set());
  protected accountActionError = signal<string | null>(null);

  /** Distinct notification types present, for the type dropdown. */
  protected types = computed(() => [...new Set(this.items().map((n) => n.type))].sort());

  protected visible = computed(() => {
    const type = this.typeFilter();
    const audience = this.audience();
    const rels = this.rels();
    return this.items().filter((n) => {
      if (type !== 'all' && n.type !== type) {
        return false;
      }
      if (audience === 'all') {
        return true;
      }
      const r = rels.get(n.account.id);
      return audience === 'friends' ? !!r?.following : !!r?.followed_by;
    });
  });

  /** The filtered list with same-status pile-ups collapsed into group rows. */
  protected rows = computed(() => groupNotifications(this.visible()));

  /** Notification actors the viewer has not followed, deduped to one profile row each. */
  protected newAccounts = computed(() =>
    accountsNewToMe(this.items(), this.rels(), this.dismissedAccounts(), this.auth.account()),
  );

  /** The "who favourited / who boosted" dialog opened from a group row. */
  protected listTarget = signal<{ statusId: string; mode: AccountListMode } | null>(null);

  constructor() {
    effect(() => {
      // `bsky:` ids name nothing this server issued, so batching them into
      // /api/v1/accounts/relationships can only 400. The controls that need
      // relationships are hidden for Bluesky anyway; this stops the effect
      // firing at all.
      if (this.source() !== 'mastodon') {
        return;
      }
      if (this.audience() === 'all' && this.view() !== 'new-accounts') {
        return;
      }
      const missing = [
        ...new Set(
          this.items()
            .filter((notification) => !isSameAccount(notification.account, this.auth.account()))
            .map((n) => n.account.id)
            .filter((id) => !this.requestedRels.has(id)),
        ),
      ];
      if (!missing.length) {
        return;
      }
      for (const id of missing) {
        this.requestedRels.add(id);
      }
      this.relationshipChecksPending.update((count) => count + 1);
      this.relationshipCheckFailed.set(false);
      this.api.relationships(missing).subscribe({
        next: (list) => {
          this.rels.update((map) => {
            const next = new Map(map);
            for (const r of list) {
              next.set(r.id, r);
            }
            return next;
          });
          this.relationshipChecksPending.update((count) => Math.max(0, count - 1));
        },
        error: (error: unknown) => {
          for (const id of missing) {
            this.requestedRels.delete(id);
          }
          this.relationshipChecksPending.update((count) => Math.max(0, count - 1));
          this.relationshipCheckFailed.set(true);
          this.diagnostics.error('Notifications', 'load:relationships-error', error, {
            accounts: missing.length,
          });
        },
      });
    });
  }

  private liveSub: Subscription | null = null;

  /** Follow Blue → "Auto-refresh timeline" for as long as this page is open. */
  private readonly liveEffect = effect(() => this.syncLive());

  ngOnInit(): void {
    this.source.set(
      this.bskySession.linked() ? (this.mastodonAvailable() ? 'all' : 'bluesky') : 'mastodon',
    );
    this.diagnostics.info('Notifications', 'page:open', {
      source: this.source(),
      mastodonConfigured: this.mastodonAvailable(),
      blueskyConfigured: this.bskySession.linked(),
    });
    this.load();
  }

  /** Load the first page of whichever source is selected. */
  private load(): void {
    this.pageSub?.unsubscribe();
    this.loading.set(true);
    this.loadingMore.set(false);
    this.items.set([]);
    this.exhausted.set(false);
    this.bskyError.set(null);
    this.mastodonError.set(null);
    this.bskyCursor = null;
    this.mastodonCursor = undefined;
    this.mastodonDone = this.source() === 'bluesky' || !this.mastodonAvailable();
    this.bskyDone = this.source() === 'mastodon' || !this.bskySession.linked();
    this.loadRound();
  }

  /**
   * Switch which network's notifications are showing. The list is reloaded from
   * scratch rather than kept per-source: notifications go stale fast, and a
   * cached page from five minutes ago is worse than a spinner.
   */
  setSource(source: NotificationSource): void {
    if (this.source() === source) {
      return;
    }
    this.source.set(source);
    // Mastodon-only controls do not survive the switch; reset them so coming
    // back does not land on a filter the other list could not honour.
    this.audience.set('all');
    this.typeFilter.set('all');
    this.view.set('notifications');
    // No explicit stop: `syncLive` reads `source()`, so switching to Bluesky
    // closes the stream and switching back reopens it if the pref is on.
    this.diagnostics.info('Notifications', 'user:set-source', { source });
    this.load();
  }

  /** Re-read the current source from the top. */
  refresh(): void {
    this.load();
  }

  /** Failures are isolated so a healthy network's notifications remain usable. */
  private loadRound(): void {
    const pages: Observable<MastodonNotification[]>[] = [];
    if (!this.mastodonDone) {
      pages.push(
        this.api.notifications(this.mastodonCursor).pipe(
          timeout(15_000),
          map((batch) => {
            const cursor = batch.at(-1)?.id;
            this.mastodonDone = !cursor || cursor === this.mastodonCursor;
            this.mastodonCursor = cursor ?? this.mastodonCursor;
            this.diagnostics.info('Notifications', 'load:success', { notifications: batch.length });
            return batch;
          }),
          catchError((error: unknown) => {
            this.mastodonDone = true;
            this.mastodonError.set(
              this.transloco.translate<string>('pages.notifications.mastodonLoadFailed'),
            );
            this.diagnostics.error('Notifications', 'load:error', error);
            return of([]);
          }),
        ),
      );
    }
    if (!this.bskyDone) {
      const cursor = this.bskyCursor;
      pages.push(
        this.bskyNotifications.page(cursor).pipe(
          timeout(15_000),
          map((page) => {
            this.bskyCursor = page.cursor;
            this.bskyDone = !page.cursor || page.cursor === cursor;
            this.diagnostics.info('Notifications', 'load:bsky-success', {
              notifications: page.notifications.length,
            });
            if (!cursor) this.bskyNotifications.markSeen().subscribe({ error: () => undefined });
            return page.notifications;
          }),
          catchError((error: unknown) => {
            this.bskyDone = true;
            this.bskyError.set(
              this.transloco.translate<string>('pages.notifications.bskyLoadFailed'),
            );
            this.diagnostics.error('Notifications', 'load:bsky-error', error);
            return of([]);
          }),
        ),
      );
    }
    this.pageSub = (pages.length ? forkJoin(pages) : of([])).subscribe((batches) => {
      this.mergeItems(batches.flat());
      this.loading.set(false);
      this.loadingMore.set(false);
      this.exhausted.set(this.mastodonDone && this.bskyDone);
    });
  }

  private mergeItems(batch: MastodonNotification[]): void {
    this.items.update((list) =>
      [...new Map([...list, ...batch].map((n) => [n.id, n])).values()].sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
      ),
    );
  }

  ngOnDestroy(): void {
    this.pageSub?.unsubscribe();
    this.liveSub?.unsubscribe();
  }

  loadMore(): void {
    if (this.loading() || this.loadingMore() || this.exhausted()) return;
    this.loadingMore.set(true);
    this.loadRound();
  }

  private stopLive(): void {
    this.liveSub?.unsubscribe();
    this.liveSub = null;
    this.live.set(false);
  }

  /**
   * Open or close the stream to match Blue → "Auto-refresh timeline", the same
   * preference Home and the public timeline follow. The "Go live" button that
   * used to sit in this page's header is gone: one setting now governs every
   * live surface, rather than each page carrying its own switch.
   *
   * Bluesky has no notification stream — it is polled — so the stream stays
   * shut while that source is selected no matter what the preference says.
   */
  private syncLive(): void {
    const wanted =
      this.prefs.autoRefreshTimeline() && this.mastodonAvailable() && this.source() !== 'bluesky';
    if (wanted === this.live()) {
      return;
    }
    if (!wanted) {
      this.stopLive();
      return;
    }
    this.live.set(true);
    this.liveSub = this.streaming.open({ stream: 'user' }).subscribe(({ event, payload }) => {
      if (event === 'notification') {
        this.mergeItems([payload as MastodonNotification]);
      }
    });
  }

  setView(view: NotificationView): void {
    this.view.set(view);
    this.accountActionError.set(null);
    this.diagnostics.info('Notifications', 'user:set-view', { view });
  }

  newAccountItem(candidate: NewAccountCandidate): AccountWithMatches {
    return { account: candidate.account, matchingPosts: [] };
  }

  newAccountReason(candidate: NewAccountCandidate): string {
    const notification = candidate.notification;
    let base: string;
    switch (notification.type) {
      case 'favourite':
        base = this.transloco.translate<string>('pages.notifications.reason.likedPost');
        break;
      case 'reblog':
        base = this.transloco.translate<string>('pages.notifications.reason.boostedPost');
        break;
      case 'mention':
        base = this.transloco.translate<string>(
          notification.status?.in_reply_to_id
            ? 'pages.notifications.reason.replied'
            : 'pages.notifications.reason.mentioned',
        );
        break;
      case 'follow':
        base = this.transloco.translate<string>('pages.notifications.reason.followed');
        break;
      default:
        base = this.label(notification.type);
    }
    const extra = candidate.notificationCount - 1;
    return extra > 0
      ? this.transloco.translate<string>(
          extra === 1
            ? 'pages.notifications.reason.more.one'
            : 'pages.notifications.reason.more.other',
          { base, count: extra },
        )
      : base;
  }

  newAccountReasonLink(candidate: NewAccountCandidate): (string | number)[] | null {
    return candidate.notification.status ? ['/statuses', candidate.notification.status.id] : null;
  }

  isAccountActionBusy(id: string): boolean {
    return this.accountActionBusy().has(id);
  }

  followAccount(account: Account): void {
    if (this.isAccountActionBusy(account.id)) return;
    this.setAccountActionBusy(account.id, true);
    this.accountActionError.set(null);
    this.diagnostics.info('Notifications', 'user:follow-new-account', { accountId: account.id });
    this.api.follow(account.id).subscribe({
      next: (relationship) => {
        this.setRelationship(relationship);
        this.setAccountActionBusy(account.id, false);
      },
      error: () => {
        this.setAccountActionBusy(account.id, false);
        this.accountActionError.set(
          this.transloco.translate<string>('pages.notifications.followFailed', {
            acct: account.acct,
          }),
        );
      },
    });
  }

  muteAccount(request: { account: Account; seconds: number | null }): void {
    const { account, seconds } = request;
    if (this.isAccountActionBusy(account.id)) return;
    this.setAccountActionBusy(account.id, true);
    this.accountActionError.set(null);
    this.diagnostics.info('Notifications', 'user:mute-new-account', {
      accountId: account.id,
      seconds,
    });
    this.api.muteAccount(account.id, seconds ?? undefined).subscribe({
      next: (relationship) => this.finishModeration(account.id, relationship),
      error: () => {
        this.setAccountActionBusy(account.id, false);
        this.accountActionError.set(
          this.transloco.translate<string>('pages.notifications.muteFailed', {
            acct: account.acct,
          }),
        );
      },
    });
  }

  blockAccount(account: Account): void {
    if (this.isAccountActionBusy(account.id)) return;
    this.setAccountActionBusy(account.id, true);
    this.accountActionError.set(null);
    this.diagnostics.info('Notifications', 'user:block-new-account', { accountId: account.id });
    this.api.block(account.id).subscribe({
      next: (relationship) => this.finishModeration(account.id, relationship),
      error: () => {
        this.setAccountActionBusy(account.id, false);
        this.accountActionError.set(
          this.transloco.translate<string>('pages.notifications.blockFailed', {
            acct: account.acct,
          }),
        );
      },
    });
  }

  private finishModeration(accountId: string, relationship: Relationship): void {
    this.setRelationship(relationship);
    this.dismissedAccounts.update((ids) => new Set(ids).add(accountId));
    this.setAccountActionBusy(accountId, false);
  }

  private setRelationship(relationship: Relationship): void {
    this.rels.update((map) => new Map(map).set(relationship.id, relationship));
  }

  private setAccountActionBusy(id: string, busy: boolean): void {
    this.accountActionBusy.update((ids) => {
      const next = new Set(ids);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Dialog mode for a grouped type; null when the API has no "who did it" list. */
  /**
   * Whether a group row's "and N others" opens the who-liked/who-boosted dialog.
   *
   * Null for Bluesky: the dialog fetches `/api/v1/statuses/{id}/favourited_by`,
   * and a `bsky:` id names nothing this server has seen. Bluesky's equivalents
   * (`getLikes` / `getRepostedBy`) exist and could back this later; until then
   * the count renders as plain text rather than a button that 404s.
   */
  listMode(type: string, status?: Status): AccountListMode | null {
    if (
      status?.provider === 'bluesky' ||
      status?.id.startsWith('bsky:') ||
      this.source() === 'bluesky'
    ) {
      return null;
    }
    return type === 'favourite' ? 'favourited_by' : type === 'reblog' ? 'reblogged_by' : null;
  }

  othersLabel(row: NotifRow & { kind: 'group' }): string {
    const rest = row.count - row.sample.length;
    return this.transloco.translate<string>(
      rest === 1 ? 'pages.notifications.others.one' : 'pages.notifications.others.other',
      { count: rest },
    );
  }

  openGroupList(row: NotifRow & { kind: 'group' }): void {
    const mode = this.listMode(row.type, row.status);
    if (mode) {
      this.listTarget.set({ statusId: row.status.id, mode });
    }
  }

  /**
   * The conversations-tab chat key for a mention, matching how the chat list
   * groups public replies (by the reply guy). Passed as `?open=` so the DM tab
   * opens straight onto that chat — we nudge people toward the chat view over
   * the raw thread.
   */
  /**
   * The chat row a mention belongs to, in the key format the Conversations page
   * groups by. Direct mentions are grouped there by participant set under
   * `priv:`, everything else by author under `pub:`.
   *
   * Sending a direct mention to a `pub:` key was the old behaviour and it
   * matched no row at all: Conversations then drafted an empty public stub
   * while the real DM sat unopened in the private tab. The participant set is
   * me plus everyone mentioned — the same list `privateKey` sorts and joins.
   */
  chatKey(n: MastodonNotification): string {
    if (n.status?.visibility !== 'direct') {
      return `pub:${n.account.acct}`;
    }
    const me = this.auth.account()?.acct;
    const accts = new Set<string>([n.account.acct]);
    for (const mention of n.status.mentions ?? []) {
      // My own handle is in `mentions` (I'm the one notified) but the
      // conversation's account list is the *other* participants, so drop it.
      if (mention.acct !== me) {
        accts.add(mention.acct);
      }
    }
    return `priv:${[...accts].sort().join(',')}`;
  }

  label(type: string): string {
    switch (type) {
      case 'favourite':
        return this.transloco.translate<string>('pages.notifications.label.favourite');
      case 'reblog':
        return this.transloco.translate<string>('pages.notifications.label.reblog');
      case 'follow':
        return this.transloco.translate<string>('pages.notifications.label.follow');
      case 'mention':
        return this.transloco.translate<string>('pages.notifications.label.mention');
      default:
        return type;
    }
  }
}
