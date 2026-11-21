import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { BlueskyOAuth } from '../connections/bluesky/bluesky-oauth';
import { BlueskySession } from '../connections/bluesky/bluesky-session';
import {
  blueskyIdentity,
  saveBlueskyIdentity,
} from '../connections/bluesky/bluesky-identity-store';
import { BskyNotificationPage } from '../connections/bluesky/bluesky-types';
import { misskeyIdentity } from '../connections/misskey/misskey-identity-store';
import { MkNotification } from '../connections/misskey/misskey-types';
import { externalFetch } from '../platform/http/external-fetch';
import {
  scopeSuffixForDid,
  scopeSuffixForMastodonAccount,
  scopeSuffixForMisskey,
  scopeSuffixForToken,
} from '../platform/session/account-scope';
import { AccountChoice, Auth } from '../platform/session/auth';
import { MastodonNotification } from '../platform/api/models';
import { NATIVE_SOCIAL } from '../platform/session/platform-login';

const READ_AT_KEY = 'mockingbird_reply_read_at';
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 7000;
const PAGE_LIMIT = 80;

// i18n accountReplies.count: {{count}} new replies

export interface ReplyCount {
  count: number;
  more: boolean;
}

/** Recent mentions and replies the app believes have not been read. */
@Injectable({ providedIn: 'root' })
export class AccountReplyCounts {
  private readonly auth = inject(Auth);
  private readonly http = inject(HttpClient);
  private readonly oauth = inject(BlueskyOAuth);
  private readonly bskySession = inject(BlueskySession);
  private readonly native = inject(NATIVE_SOCIAL);
  readonly accounts = computed<AccountChoice[]>(() => [
    ...this.auth.sessions().map((session) => ({
      key: `mastodon:${session.id}`,
      kind: 'mastodon' as const,
      token: session.token,
      server: session.server ?? '',
      account: session.account,
    })),
    ...this.auth.blueskyAccounts(),
    ...this.auth
      .misskeyAccounts()
      .filter((choice) => !!misskeyIdentity(choice.misskeyKey)?.credentials.token),
  ]);
  readonly counts = signal<Record<string, ReplyCount | null>>({});
  readonly checking = signal(false);
  private lastCheck = 0;
  private pending: Promise<void> | null = null;
  /**
   * OAuth requests still running, timeouts or not. The SDK may be rotating a
   * refresh token inside one; see {@link settled}.
   */
  private readonly inFlight = new Set<Promise<unknown>>();

  /**
   * Resolves once no OAuth request from these checks is still running, or
   * after `maxMs`. Call before reloading the page (an account switch does).
   *
   * Why: opening the account menu checks every account, which can make the
   * OAuth SDK refresh a Bluesky identity's tokens. Bluesky rotates the refresh
   * token on use, so a reload that lands after the server answered but before
   * the SDK stored the new pair leaves only a spent token behind. The next
   * restore then fails, the SDK deletes the session, and Home asks to sign in
   * to Bluesky again. Waiting a moment for the write avoids that.
   */
  async settled(maxMs = 10_000): Promise<void> {
    if (!this.inFlight.size) return;
    await Promise.race([
      Promise.allSettled([...this.inFlight]),
      new Promise((resolve) => setTimeout(resolve, maxMs)),
    ]);
  }

  /** Run `then` now when nothing is in flight, else once {@link settled}. */
  afterSettled(then: () => void): void {
    if (!this.inFlight.size) then();
    else void this.settled().then(then);
  }

  private track<T>(request: Promise<T>): Promise<T> {
    this.inFlight.add(request);
    const done = () => this.inFlight.delete(request);
    request.then(done, done);
    return request;
  }

  label(key: string): string {
    const count = this.counts()[key];
    if (!count?.count) return '';
    return `${count.count}${count.more ? '+' : ''}`;
  }

  hasAccount(key: string): boolean {
    return this.accounts().some((choice) => choice.key === key);
  }

  currentKey(): string | null {
    const kind = this.auth.kind();
    if (kind === 'mastodon') {
      const session = this.auth.sessions().find((row) => row.token === this.auth.token());
      return session ? `mastodon:${session.id}` : null;
    }
    if (kind === 'bluesky') {
      const account = this.auth
        .blueskyAccounts()
        .find((row) => row.account?.id === this.auth.account()?.id);
      return account?.key ?? null;
    }
    if (kind === 'misskey') {
      const account = this.auth
        .misskeyAccounts()
        .find((row) => row.misskeyKey === this.auth.activeMisskeyKey());
      return account && this.hasAccount(account.key) ? account.key : null;
    }
    return null;
  }

  /** Refresh on opening a picker, not on every app render. */
  refresh(force = false): Promise<void> {
    if (this.pending) return this.pending;
    if (!force && Date.now() - this.lastCheck < 60_000) return Promise.resolve();
    const choices = this.accounts();
    this.checking.set(true);
    let next = 0;
    const worker = async () => {
      while (next < choices.length) {
        const choice = choices[next++];
        const result = await this.check(choice).catch(() => null);
        this.counts.update((all) => ({ ...all, [choice.key]: result }));
      }
    };
    this.pending = Promise.all(Array.from({ length: Math.min(4, choices.length) }, worker)).then(
      () => {
        this.lastCheck = Date.now();
        this.checking.set(false);
        this.pending = null;
      },
    );
    return this.pending;
  }

  /** Reflect a successful Notifications read immediately in the account menu. */
  markCurrentRead(kind: 'mastodon' | 'bluesky' | 'misskey'): void {
    const key = this.currentKey();
    const choice = this.accounts().find((row) => row.key === key && row.kind === kind);
    if (!choice) return;
    if (kind !== 'bluesky') {
      try {
        localStorage.setItem(READ_AT_KEY + this.scope(choice), String(Date.now()));
      } catch {
        // The in-memory count still reflects opening Notifications this visit.
      }
    }
    this.counts.update((all) => ({ ...all, [choice.key]: { count: 0, more: false } }));
  }

  private cutoff(choice: AccountChoice): number {
    let readAt = 0;
    try {
      readAt = Number(localStorage.getItem(READ_AT_KEY + this.scope(choice))) || 0;
    } catch {
      // An unavailable store means only the 24-hour window applies.
    }
    return Math.max(Date.now() - DAY_MS, readAt);
  }

  private scope(choice: AccountChoice): string {
    if (choice.kind === 'bluesky') return scopeSuffixForDid(choice.did ?? '');
    if (choice.kind === 'misskey') return scopeSuffixForMisskey(choice.misskeyKey ?? '');
    return choice.account?.id
      ? scopeSuffixForMastodonAccount(choice.account.id, choice.server)
      : scopeSuffixForToken(choice.token ?? '');
  }

  private async check(choice: AccountChoice): Promise<ReplyCount | null> {
    if (choice.kind === 'mastodon') return this.mastodon(choice);
    if (choice.kind === 'bluesky') return this.bluesky(choice);
    if (choice.kind === 'misskey') return this.misskey(choice);
    return null;
  }

  private async mastodon(choice: AccountChoice): Promise<ReplyCount> {
    if (!choice.token) throw new Error('No Mastodon token');
    const server = (choice.server || location.origin).replace(/\/+$/, '');
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    params.append('types[]', 'mention');
    const rows = await firstValueFrom(
      this.http
        .get<MastodonNotification[]>(`${server}/api/v1/notifications?${params}`, {
          headers: { Authorization: `Bearer ${choice.token}` },
          context: externalFetch(),
        })
        .pipe(timeout(TIMEOUT_MS)),
    );
    const cutoff = this.cutoff(choice);
    return {
      count: rows.filter((row) => row.type === 'mention' && Date.parse(row.created_at) > cutoff)
        .length,
      more: rows.length === PAGE_LIMIT && Date.parse(rows.at(-1)!.created_at) > cutoff,
    };
  }

  private async bluesky(choice: AccountChoice): Promise<ReplyCount> {
    const identity = blueskyIdentity(choice.did);
    if (!identity) throw new Error('No Bluesky identity');
    const path = `/xrpc/app.bsky.notification.listNotifications?limit=${PAGE_LIMIT}`;
    const service = identity.profile.service.replace(/\/+$/, '');
    let response: Response;
    if (identity.credentials.authMethod === 'oauth') {
      response = await Promise.race([
        this.native && identity.credentials.nativeHandle
          ? this.native.blueskyFetch(identity.credentials.nativeHandle, path)
          : this.track(
              this.oauth.fetch(identity.profile.did, path, {
                signal: AbortSignal.timeout(TIMEOUT_MS),
              }),
            ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS),
        ),
      ]);
    } else {
      response = await fetch(`${service}${path}`, {
        headers: { Authorization: `Bearer ${identity.credentials.accessJwt}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 401) {
        if (this.bskySession.session()?.did === identity.profile.did) {
          const current = await firstValueFrom(
            this.bskySession.refresh().pipe(timeout(TIMEOUT_MS)),
          );
          response = await fetch(`${service}${path}`, {
            headers: { Authorization: `Bearer ${current.accessJwt}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!response.ok) throw new Error('Bluesky notifications unavailable');
        } else {
          const refreshed = await fetch(`${service}/xrpc/com.atproto.server.refreshSession`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${identity.credentials.refreshJwt}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!refreshed.ok) throw new Error('Bluesky session expired');
          const tokens = (await refreshed.json()) as { accessJwt: string; refreshJwt: string };
          saveBlueskyIdentity(identity.profile, { ...identity.credentials, ...tokens });
          response = await fetch(`${service}${path}`, {
            headers: { Authorization: `Bearer ${tokens.accessJwt}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
        }
      }
    }
    if (!response.ok) throw new Error('Bluesky notifications unavailable');
    const page = (await response.json()) as BskyNotificationPage;
    const cutoff = Date.now() - DAY_MS;
    const recent = page.notifications.filter((row) => Date.parse(row.indexedAt) > cutoff);
    return {
      count: recent.filter(
        (row) => !row.isRead && (row.reason === 'reply' || row.reason === 'mention'),
      ).length,
      more: !!page.cursor && recent.length === PAGE_LIMIT,
    };
  }

  private async misskey(choice: AccountChoice): Promise<ReplyCount> {
    const identity = misskeyIdentity(choice.misskeyKey);
    if (!identity?.credentials.token) throw new Error('No Misskey token');
    const rows = await firstValueFrom(
      this.http
        .post<MkNotification[]>(
          `${identity.profile.server}/api/i/notifications`,
          {
            i: identity.credentials.token,
            limit: PAGE_LIMIT,
            markAsRead: false,
            includeTypes: ['mention', 'reply', 'quote'],
          },
          { context: externalFetch() },
        )
        .pipe(timeout(TIMEOUT_MS)),
    );
    const cutoff = this.cutoff(choice);
    return {
      count: rows.filter(
        (row) =>
          ['mention', 'reply', 'quote'].includes(row.type) && Date.parse(row.createdAt) > cutoff,
      ).length,
      more: rows.length === PAGE_LIMIT && Date.parse(rows.at(-1)!.createdAt) > cutoff,
    };
  }
}
