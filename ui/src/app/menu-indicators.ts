import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription, finalize } from 'rxjs';
import { Router } from '@angular/router';
import { Api } from './api';
import { Auth } from './auth';
import { scopedKey } from './account-scope';
import { BlueskySession } from './providers/bluesky/bluesky-session';
import { BlueskyApi } from './providers/bluesky/bluesky-api';
import { BlueskyChatApi } from './providers/bluesky/bluesky-chat-api';
import { MastodonNotification } from './models';
import {
  DEFAULT_INDICATOR_PREFERENCES,
  IndicatorPreferences,
  indicatorPreferences,
  inQuietHours,
  ordinaryDue,
} from './menu-indicator-policy';

const PREFS_KEY = 'mockingbird_menu_indicator_preferences';
const STATE_KEY = 'mockingbird_menu_indicator_state';
type Lane = 'ordinary' | 'chat';
interface IndicatorState {
  seen: string[];
  since: Record<Lane, number | null>;
  lit: Record<Lane, boolean>;
  baseline: number;
}

/** Only header signals. Never marks provider messages read or changes live chat. */
@Injectable({ providedIn: 'root' })
export class MenuIndicators {
  private api = inject(Api);
  private auth = inject(Auth);
  private bsky = inject(BlueskySession);
  private notifications = inject(BlueskyApi);
  private chatApi = inject(BlueskyChatApi);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  readonly preferences = signal<IndicatorPreferences>(this.loadPreferences());
  readonly ordinary = signal(false);
  readonly chat = signal(false);
  private state: IndicatorState = this.emptyState();
  private scope = '';
  private started = false;
  private requests = new Subscription();
  private busy = new Set<string>();

  configure(value: Partial<IndicatorPreferences>): void {
    const prefs = indicatorPreferences({ ...this.preferences(), ...value });
    this.preferences.set(prefs);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* Session settings still apply. */
    }
    this.tick();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.poll();
    const clock = setInterval(() => this.tick(), 1000);
    const poll = setInterval(() => this.poll(), 60_000);
    const focus = (): void => {
      this.tick();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('blur', focus);
    document.addEventListener('visibilitychange', focus);
    const routes = this.router.events.subscribe(focus);
    this.destroyRef.onDestroy(() => {
      clearInterval(clock);
      clearInterval(poll);
      this.requests.unsubscribe();
      routes.unsubscribe();
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', focus);
      document.removeEventListener('visibilitychange', focus);
    });
  }

  private emptyState(): IndicatorState {
    return {
      seen: [],
      since: { ordinary: null, chat: null },
      lit: { ordinary: false, chat: false },
      baseline: Date.now(),
    };
  }

  private loadPreferences(): IndicatorPreferences {
    try {
      return indicatorPreferences(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') ?? {});
    } catch {
      return { ...DEFAULT_INDICATOR_PREFERENCES };
    }
  }

  private updateScope(): void {
    const scope = scopedKey(STATE_KEY) + ':' + (this.bsky.session()?.did ?? '');
    if (this.scope === scope) return;
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.busy.clear();
    this.scope = scope;
    this.state = this.emptyState();
    try {
      const stored = JSON.parse(
        localStorage.getItem(scopedKey(STATE_KEY)) ?? 'null',
      ) as IndicatorState | null;
      if (
        stored &&
        Array.isArray(stored.seen) &&
        stored.since &&
        stored.lit &&
        Number.isFinite(stored.baseline)
      )
        this.state = stored;
    } catch {
      /* Invalid cache starts with a fresh baseline. */
    }
    this.save();
  }

  private active(lane: Lane): boolean {
    return (
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      this.router.url.startsWith(lane === 'chat' ? '/conversations' : '/notifications')
    );
  }

  tick(now = new Date()): void {
    this.updateScope();
    const before = JSON.stringify(this.state);
    const quiet = inQuietHours(now, this.preferences());
    for (const lane of ['ordinary', 'chat'] as const) {
      if (this.active(lane)) {
        this.state.since[lane] = null;
        this.state.lit[lane] = false;
      } else {
        const since = this.state.since[lane];
        if (
          since !== null &&
          !quiet &&
          (lane === 'chat'
            ? now.getTime() - since >= this.preferences().chatMinutes * 60_000
            : ordinaryDue(since, now, this.preferences()))
        ) {
          this.state.lit[lane] = true;
          this.state.since[lane] = null;
        }
      }
    }
    this.ordinary.set(!this.auth.isAnonymous && !quiet && this.state.lit.ordinary);
    this.chat.set(!this.auth.isAnonymous && !quiet && this.state.lit.chat);
    if (JSON.stringify(this.state) !== before) this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(scopedKey(STATE_KEY), JSON.stringify(this.state));
    } catch {
      /* Indicators still work for this session. */
    }
  }

  private receive(id: string, lane: Lane, at: string, unread = false): void {
    if (this.state.seen.includes(id)) return;
    this.state.seen.push(id);
    this.state.seen = this.state.seen.slice(-2000);
    if (
      (unread || Date.parse(at) >= this.state.baseline) &&
      !this.active(lane) &&
      !this.state.lit[lane]
    ) {
      this.state.since[lane] ??= Date.now();
    }
    this.save();
    this.tick();
  }

  private receiveNotifications(source: string, rows: MastodonNotification[]): void {
    for (const row of rows)
      this.receive(
        `${source}:${row.id}`,
        row.type === 'mention' &&
          (row.status?.in_reply_to_id || row.status?.visibility === 'direct')
          ? 'chat'
          : 'ordinary',
        row.created_at,
      );
  }

  private fetch<T>(key: string, request: () => Observable<T>, receive: (result: T) => void): void {
    if (this.busy.has(key)) return;
    this.busy.add(key);
    const scope = this.scope;
    this.requests.add(
      request()
        .pipe(finalize(() => this.busy.delete(key)))
        .subscribe({
          next: (result) => {
            if (scope === this.scope) receive(result);
          },
          error: () => {
            /* Retry on the next poll; never light up for a fetch error. */
          },
        }),
    );
  }

  private poll(): void {
    this.tick();
    if (!this.auth.lacksMastodonToken) {
      this.fetch(
        'notifications',
        () => this.api.notifications(),
        (rows) => this.receiveNotifications('mastodon', rows),
      );
      this.fetch(
        'conversations',
        () => this.api.conversations(),
        (rows) => {
          for (const row of rows)
            if (
              row.unread &&
              row.last_status &&
              row.last_status.account.id !== this.auth.account()?.id
            )
              this.receive(`dm:${row.last_status.id}`, 'chat', row.last_status.created_at, true);
        },
      );
    }
    if (!this.auth.isAnonymous && this.bsky.session()) {
      this.fetch(
        'bsky-notifications',
        () => this.notifications.listNotifications(null),
        (page) => {
          for (const row of page.notifications)
            this.receive(
              `bsky:${this.bsky.session()?.did}:${row.uri}:${row.reason}`,
              row.reason === 'reply' ? 'chat' : 'ordinary',
              row.indexedAt,
              !row.isRead,
            );
        },
      );
      this.fetch(
        'bsky-chat',
        () => this.chatApi.listConvos(),
        (page) => {
          for (const row of page.convos)
            if (
              row.unreadCount &&
              !row.muted &&
              row.lastMessage &&
              row.lastMessage.sender.did !== this.bsky.session()?.did
            )
              this.receive(
                `bsky-dm:${this.bsky.session()?.did}:${row.id}:${row.lastMessage.id}`,
                'chat',
                row.lastMessage.sentAt,
                true,
              );
        },
      );
    }
  }
}
