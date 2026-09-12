import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { Auth } from './auth';
import { scopedKey } from './account-scope';
import { BlueskySession } from './providers/bluesky/bluesky-session';
import { Conversation, MastodonNotification } from './models';
import { Streaming } from './streaming';
import { IndicatorEvents } from './indicator-events';
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
  pending: Record<string, Lane>;
  groups: Record<string, string>;
}

/** Only header signals. Never marks provider messages read or changes live chat. */
@Injectable({ providedIn: 'root' })
export class MenuIndicators {
  private streaming = inject(Streaming);
  private events = inject(IndicatorEvents);
  private auth = inject(Auth);
  private bsky = inject(BlueskySession);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  readonly preferences = signal<IndicatorPreferences>(this.loadPreferences());
  readonly ordinary = signal(false);
  readonly chat = signal(false);
  private state: IndicatorState = this.emptyState();
  private scope = '';
  private started = false;
  private streams = new Subscription();
  private connection = '';

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
    this.tick();
    // This clock only delivers locally queued signals. It never fetches data.
    const clock = setInterval(() => this.tick(), 1000);
    const observations = this.events.received.subscribe((event) => {
      this.tick();
      if (this.auth.isAnonymous || event.did !== this.bsky.session()?.did) return;
      this.receive(event.id, event.lane, event.at, event.unread, event.group);
    });
    const focus = (): void => {
      this.tick();
    };
    const storage = (event: StorageEvent): void => {
      if (event.key !== scopedKey(STATE_KEY)) return;
      this.restoreState(event.newValue);
      this.tick();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('blur', focus);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', focus);
    const routes = this.router.events.subscribe(focus);
    this.destroyRef.onDestroy(() => {
      clearInterval(clock);
      observations.unsubscribe();
      this.streams.unsubscribe();
      routes.unsubscribe();
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', focus);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', focus);
    });
  }

  private emptyState(): IndicatorState {
    return {
      seen: [],
      since: { ordinary: null, chat: null },
      lit: { ordinary: false, chat: false },
      baseline: Date.now(),
      pending: {},
      groups: {},
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
    this.scope = scope;
    this.state = this.emptyState();
    try {
      this.restoreState(localStorage.getItem(scopedKey(STATE_KEY)));
    } catch {
      /* Storage can be unavailable; keep session state. */
    }
    this.save();
  }

  private restoreState(value: string | null): void {
    try {
      const stored = JSON.parse(value ?? 'null') as IndicatorState | null;
      if (
        stored &&
        Array.isArray(stored.seen) &&
        stored.since &&
        stored.lit &&
        stored.pending &&
        stored.groups &&
        Number.isFinite(stored.baseline)
      )
        this.state = stored;
    } catch {
      /* Ignore malformed state from storage. */
    }
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
    if (this.started) this.syncStreams();
    const before = JSON.stringify(this.state);
    const quiet = inQuietHours(now, this.preferences());
    for (const lane of ['ordinary', 'chat'] as const) {
      if (this.active(lane)) {
        for (const [id, pendingLane] of Object.entries(this.state.pending)) {
          if (pendingLane === lane) {
            delete this.state.pending[id];
            delete this.state.groups[id];
          }
        }
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

  private receive(id: string, lane: Lane, at: string, unread = true, group?: string): void {
    if (group && this.state.pending[id]) this.state.groups[id] = group;
    if (!unread) {
      delete this.state.pending[id];
      delete this.state.groups[id];
      if (group) {
        for (const [pendingId, pendingGroup] of Object.entries(this.state.groups)) {
          if (pendingGroup === group) {
            delete this.state.pending[pendingId];
            delete this.state.groups[pendingId];
          }
        }
      }
      if (!Object.values(this.state.pending).includes(lane)) {
        this.state.since[lane] = null;
        this.state.lit[lane] = false;
      }
    }
    if (this.state.seen.includes(id)) {
      this.save();
      this.tick();
      return;
    }
    this.state.seen.push(id);
    this.state.seen = this.state.seen.slice(-2000);
    if (
      unread &&
      Date.parse(at) >= this.state.baseline &&
      !this.active(lane) &&
      !this.auth.isAnonymous
    ) {
      this.state.pending[id] = lane;
      if (group) this.state.groups[id] = group;
      if (!this.state.lit[lane]) this.state.since[lane] ??= Date.now();
    }
    this.save();
    this.tick();
  }

  private receiveNotifications(source: string, rows: MastodonNotification[]): void {
    for (const row of rows)
      this.receive(
        row.status?.visibility === 'direct' ? `dm:${row.status.id}` : `${source}:${row.id}`,
        row.type === 'mention' &&
          (row.status?.in_reply_to_id || row.status?.visibility === 'direct')
          ? 'chat'
          : 'ordinary',
        row.created_at,
      );
  }

  private syncStreams(): void {
    const connection =
      this.auth.isAnonymous || this.auth.lacksMastodonToken
        ? ''
        : `${this.scope}:${this.auth.token()}`;
    if (connection === this.connection) return;
    this.streams.unsubscribe();
    this.streams = new Subscription();
    this.connection = connection;
    if (!connection) return;
    const current = (): boolean =>
      connection === this.connection &&
      !this.auth.isAnonymous &&
      !this.auth.lacksMastodonToken &&
      connection ===
        `${scopedKey(STATE_KEY)}:${this.bsky.session()?.did ?? ''}:${this.auth.token()}`;
    this.streams.add(
      this.streaming.open({ stream: 'user:notification' }).subscribe(({ event, payload }) => {
        if (current() && event === 'notification') {
          this.receiveNotifications('mastodon', [payload as MastodonNotification]);
        }
      }),
    );
    this.streams.add(
      this.streaming.open({ stream: 'direct' }).subscribe(({ event, payload }) => {
        if (!current() || event !== 'conversation') return;
        const row = payload as Conversation;
        if (!row.last_status) return;
        this.receive(
          `dm:${row.last_status.id}`,
          'chat',
          row.last_status.created_at,
          row.unread && row.last_status.account.id !== this.auth.account()?.id,
          `dm-conversation:${row.id}`,
        );
      }),
    );
  }
}
