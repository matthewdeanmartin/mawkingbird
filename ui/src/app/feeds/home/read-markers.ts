import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { DOT_MASTODON_TYPES } from '../notifications/inbox-scenarios';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Marker, MarkerTimeline, Markers } from '../../platform/api/models';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { Auth } from '../../platform/session/auth';
import { MenuIndicators } from '../../shell/menu-indicators';

/** How long reading must pause before the position is sent to the server. */
export const MARKER_IDLE_MS = 5_000;

/**
 * Order two Mastodon status/notification ids.
 *
 * Mastodon ids are snowflakes: decimal strings whose numeric order is time
 * order. Comparing them as strings gets "9" > "10" wrong, so compare length
 * first. Non-numeric ids (other servers) fall back to string order.
 */
export function compareMastodonIds(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const left = a.replace(/^0+(?=\d)/, '');
    const right = b.replace(/^0+(?=\d)/, '');
    if (left.length !== right.length) return left.length - right.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Mastodon's read markers: where the reader stopped in Home and in
 * notifications, kept on their own server so the spot follows them across web,
 * native and Android with no Mawkingbird cloud.
 *
 * Rules (parity item 7):
 * - Writes are debounced (5 s idle) and flushed when the page is hidden.
 * - Only posts that actually passed through the viewport are reported, never
 *   posts that were merely fetched — Home calls {@link noteHomeSeen} from a
 *   visibility observer, not from the loader.
 * - The marker never moves backwards: an older id than the last known one is
 *   ignored, and a 409 (another device wrote at the same moment) re-reads the
 *   server and only writes again if this device is still ahead.
 * - Each signed-in Mastodon account has its own markers. Everything is keyed by
 *   the account scope; a write queued under one account is dropped if the
 *   reader switches before it is sent. Bluesky and Misskey never call this.
 */
@Injectable({ providedIn: 'root' })
export class ReadMarkers {
  private api = inject(Api);
  private auth = inject(Auth);
  private indicators = inject(MenuIndicators);

  /** The server's markers for the current account, as last read or written. */
  readonly server = signal<Markers>({});
  /** The account scope `server` belongs to. */
  private serverScope = '';
  /** Highest id seen locally and not yet confirmed by the server, per timeline. */
  private pending: Partial<Record<MarkerTimeline, string>> = {};
  private pendingScope = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;

  constructor() {
    const hidden = (): void => {
      if (document.visibilityState === 'hidden') void this.flush();
    };
    const pagehide = (): void => void this.flush();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', pagehide);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', pagehide);
      if (this.timer) clearTimeout(this.timer);
    });
  }

  /** Markers only exist for a signed-in Mastodon account. */
  get available(): boolean {
    return !this.auth.isAnonymous && !this.auth.lacksMastodonToken && !!this.auth.token();
  }

  /**
   * Read both markers from the server. Resolves to null when unavailable or the
   * server refuses (older servers, the anonymous reader): callers then keep
   * today's behaviour.
   */
  async refresh(): Promise<Markers | null> {
    if (!this.available) return null;
    const scope = accountScopeSuffix();
    try {
      const markers = await firstValueFrom(this.api.markers());
      if (scope !== accountScopeSuffix()) return null;
      this.adopt(scope, markers ?? {});
      return this.server();
    } catch {
      return null;
    }
  }

  /** The server's home marker for this account, if it has been read. */
  homeMarker(): Marker | null {
    return this.serverScope === accountScopeSuffix() ? (this.server().home ?? null) : null;
  }

  /** A home post passed through the viewport. Queues a debounced marker write. */
  noteHomeSeen(statusId: string): void {
    this.note('home', statusId);
  }

  /** The notifications list was read up to `notificationId`. */
  noteNotificationsRead(notificationId: string): void {
    this.note('notifications', notificationId);
  }

  /**
   * The newest home post this device has seen in this session, for this
   * account. Home only jumps to the server's marker when it is newer than this,
   * so a page rebuilt mid-session does not yank the reader around.
   */
  localHome(): string | null {
    return this.localScope === accountScopeSuffix() ? (this.local.home ?? null) : null;
  }

  private local: Partial<Record<MarkerTimeline, string>> = {};
  private localScope = '';

  private note(timeline: MarkerTimeline, id: string): void {
    if (!this.available || !id) return;
    const scope = accountScopeSuffix();
    if (scope !== this.localScope) {
      this.local = {};
      this.localScope = scope;
    }
    const seen = this.local[timeline];
    if (!seen || compareMastodonIds(id, seen) > 0) this.local[timeline] = id;
    if (scope !== this.pendingScope) {
      this.pending = {};
      this.pendingScope = scope;
    }
    const known = this.serverScope === scope ? this.server()[timeline]?.last_read_id : undefined;
    const current = this.pending[timeline] ?? known;
    // Never backwards.
    if (current && compareMastodonIds(id, current) <= 0) return;
    this.pending[timeline] = id;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), MARKER_IDLE_MS);
  }

  /** Send any queued position now (idle timeout, page hide). */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.inFlight) await this.inFlight;
    const scope = this.pendingScope;
    const update = this.pending;
    this.pending = {};
    if (!this.available || scope !== accountScopeSuffix() || !Object.keys(update).length) return;
    this.inFlight = this.write(scope, update).finally(() => (this.inFlight = null));
    await this.inFlight;
  }

  private async write(
    scope: string,
    update: Partial<Record<MarkerTimeline, string>>,
    retried = false,
  ): Promise<void> {
    const body: Partial<Record<MarkerTimeline, { last_read_id: string }>> = {};
    for (const [timeline, id] of Object.entries(update) as [MarkerTimeline, string][]) {
      body[timeline] = { last_read_id: id };
    }
    try {
      const saved = await firstValueFrom(this.api.saveMarkers(body));
      if (scope === accountScopeSuffix()) this.adopt(scope, { ...this.server(), ...saved });
    } catch (error) {
      if (!(error instanceof HttpErrorResponse) || error.status !== 409 || retried) return;
      // Another device moved the marker. Re-read; write again only where this
      // device is still ahead of what the server now holds.
      let fresh: Markers;
      try {
        fresh = (await firstValueFrom(this.api.markers())) ?? {};
      } catch {
        return;
      }
      if (scope !== accountScopeSuffix()) return;
      this.adopt(scope, fresh);
      const ahead: Partial<Record<MarkerTimeline, string>> = {};
      for (const [timeline, id] of Object.entries(update) as [MarkerTimeline, string][]) {
        const theirs = fresh[timeline]?.last_read_id;
        if (!theirs || compareMastodonIds(id, theirs) > 0) ahead[timeline] = id;
      }
      if (Object.keys(ahead).length) await this.write(scope, ahead, true);
    }
  }

  private adopt(scope: string, markers: Markers): void {
    this.serverScope = scope;
    this.server.set(markers);
    const notifications = markers.notifications;
    if (notifications && typeof notifications.unread_count === 'number') {
      void this.noteDotWorthyUnread(scope, notifications.last_read_id, notifications.unread_count);
    }
  }

  /**
   * The marker counts every kind, likes included, but only Conversations and
   * Who may light the Inbox dot (spec/sprint/inbox-views-2026-11.md). With
   * something unread, one request for the newest notification of those kinds
   * says whether any of it is past the marker. If that request fails, the count
   * is used as before: a missed reply is worse than an extra dot.
   */
  private async noteDotWorthyUnread(
    scope: string,
    lastReadId: string,
    unread: number,
  ): Promise<void> {
    if (unread <= 0) {
      this.indicators.noteServerUnread(lastReadId, 0);
      return;
    }
    let count = unread;
    try {
      const [newest] = await firstValueFrom(
        this.api.notifications(undefined, { types: [...DOT_MASTODON_TYPES], limit: 1 }),
      );
      count = newest && compareMastodonIds(newest.id, lastReadId) > 0 ? 1 : 0;
    } catch {
      // Keep the server's count.
    }
    if (scope !== accountScopeSuffix()) return;
    this.indicators.noteServerUnread(lastReadId, count);
  }
}
