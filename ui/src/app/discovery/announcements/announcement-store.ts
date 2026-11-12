import { Server } from '../../platform/http/server';
import { computed, inject, Injectable, linkedSignal, signal } from '@angular/core';
import { Api } from '../../platform/api/api';
import { Announcement } from '../../platform/api/models';
import { networkSources } from '../../shell/network-sources';
import { Auth } from '../../platform/session/auth';

interface AnnouncementContext {
  server: string;
  token: string | null;
  allowed: boolean;
}

/**
 * localStorage key holding the ids the viewer has dismissed.
 *
 * The server-side dismiss endpoint isn't reachable on every instance (and
 * doesn't hide the banner on refresh for the current session anyway), so we
 * keep a client-side "seen it" list — the banner must be dismissable against
 * mastodon.social. Unchanged from when this lived inside the banner component,
 * so existing dismissals survive the move.
 */
const DISMISSED_KEY = 'mockingbird_dismissed_announcements';

/**
 * localStorage key holding, per announcement id, how many sessions the banner
 * has shown it. Readers ignore the ✕, so the banner retires an announcement on
 * its own after {@link AUTO_DISMISS_SESSIONS} sessions. It moves into the
 * ordinary dismissed set, so it stays listed on the server page and "restore"
 * still brings it back.
 */
const VIEWS_KEY = 'mockingbird_announcement_views';

/** Sessions an announcement gets in the banner before it is dismissed for the reader. */
export const AUTO_DISMISS_SESSIONS = 2;

function readViews(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof n === 'number' && n > 0) out[id] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function writeViews(views: Record<string, number>): void {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    // Storage blocked or full: the banner simply stays until dismissed by hand.
  }
}

function readDismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The server's announcements, and which ones this browser has seen.
 *
 * Shared because three surfaces now need the same answer and must not disagree:
 * the banner above the timeline, the count on the server card in the rail, and
 * the server's own page listing every announcement. When it lived inside the
 * banner, the dismissed set was private to one component instance — a second
 * reader of the same data would have shown a count that included things the
 * reader had already dismissed.
 *
 * Fetched once per session on first request; `load()` is idempotent.
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementStore {
  private api = inject(Api);
  private server = inject(Server);
  private auth = inject(Auth);
  private usableMastodon = networkSources().usableMastodon;
  private context = computed<AnnouncementContext>(() => ({
    server: this.server.baseUrl(),
    token: this.auth.token(),
    allowed: !!this.auth.token() && !this.auth.isAnonymous && this.usableMastodon(),
  }));

  /** Everything the server published, dismissed or not. */
  readonly all = linkedSignal<AnnouncementContext, Announcement[]>({
    source: () => this.context(),
    computation: () => [],
  });
  readonly loaded = linkedSignal({ source: () => this.context(), computation: () => false });

  private dismissed = signal(new Set<string>(readDismissed()));

  /**
   * Ids the banner has already counted in this session. The store is a root
   * singleton, so this lives exactly as long as one app load: navigating away
   * from Home and back does not count twice.
   */
  private countedThisSession = new Set<string>();

  /** Not yet dismissed on this device — what the banner shows. */
  readonly active = computed(() => this.all().filter((a) => !this.dismissed().has(a.id)));
  readonly activeCount = computed(() => this.active().length);
  readonly total = computed(() => this.all().length);

  /**
   * True when something is both undismissed and flagged by the server as new.
   *
   * `published` alone is not enough — every live announcement is published.
   * Mastodon marks the ones a reader has not read yet, and that is the signal
   * worth a callout; without it the badge would shout on every page load
   * forever.
   */
  readonly hasUnread = computed(() => this.active().some((a) => a.read === false));

  private loadingFor: AnnouncementContext | null = null;
  private request = 0;

  /**
   * Announcements require both a usable Mastodon source and a user token.
   *
   * Announcements are a Mastodon-instance concept: there is no Bluesky
   * equivalent, and no endpoint to call for one. A Bluesky-primary account that
   * never opted into a Mastodon connector has no instance — so the relative
   * `/api/v1/announcements` is not prefixed by `serverInterceptor` (there is no
   * base URL to prefix it with) and resolves against the page's own origin
   * instead. On mawkingbird.com that is a static GitHub Pages site, which
   * answers the SPA 404 shim rather than JSON, and the client reports
   * `request:failed … 422`.
   *
   * Guarding here rather than at each caller because `load()` is the choke
   * point all three surfaces share — the banner over the timeline, the rail's
   * server card, and the server's announcements page. The rail already checks
   * `usableMastodon` before calling; the banner did not, and `home.html` gates
   * it on `!auth.isAnonymous`, which was the same question only while every
   * signed-in account was Mastodon-primary.
   */
  load(force = false): void {
    const context = this.context();
    if (this.loadingFor === context || (this.loaded() && !force)) {
      return;
    }
    // No Mastodon source, no announcements to have. Settle as an empty,
    // *loaded* store so the surfaces render their empty state instead of
    // waiting forever on a request that is never coming.
    // A public timeline source does not authorize the announcements endpoint.
    // No request is made while signed out, anonymous, or lacking a connector token.
    if (!context.allowed) {
      this.loaded.set(true);
      return;
    }
    this.loadingFor = context;
    const request = ++this.request;
    this.api.announcements().subscribe({
      next: (list) => {
        if (context !== this.context() || request !== this.request) return;
        this.all.set(list);
        this.retireSeen(list);
        this.loaded.set(true);
        this.loadingFor = null;
      },
      error: () => {
        if (context !== this.context() || request !== this.request) return;
        // A server with announcements switched off answers 404; that is an
        // empty list, not a failure worth surfacing.
        this.loaded.set(true);
        this.loadingFor = null;
      },
    });
  }

  /**
   * The banner rendered these announcements: count this session for each, once.
   *
   * Counting never hides anything immediately; retirement happens at the next
   * load, so an announcement does not vanish while the reader is looking at it.
   */
  noteShown(ids: readonly string[]): void {
    const fresh = ids.filter((id) => !this.countedThisSession.has(id));
    if (!fresh.length) return;
    const views = readViews();
    for (const id of fresh) {
      this.countedThisSession.add(id);
      views[id] = (views[id] ?? 0) + 1;
    }
    writeViews(views);
  }

  /**
   * Dismiss (locally only) anything the banner already showed for
   * {@link AUTO_DISMISS_SESSIONS} sessions, and forget counts for
   * announcements the server no longer publishes.
   */
  private retireSeen(list: readonly Announcement[]): void {
    const views = readViews();
    const live = new Set(list.map((a) => a.id));
    const pruned: Record<string, number> = {};
    for (const [id, n] of Object.entries(views)) if (live.has(id)) pruned[id] = n;
    if (Object.keys(pruned).length !== Object.keys(views).length) writeViews(pruned);
    const retire = list
      .filter((a) => !this.dismissed().has(a.id) && (pruned[a.id] ?? 0) >= AUTO_DISMISS_SESSIONS)
      .map((a) => a.id);
    if (retire.length) this.persist([...this.dismissed(), ...retire]);
  }

  isDismissed(id: string): boolean {
    return this.dismissed().has(id);
  }

  dismiss(id: string): void {
    if (this.dismissed().has(id)) {
      return;
    }
    this.persist([...this.dismissed(), id]);
    if (!this.context().allowed) return;
    // Best-effort server dismiss; a failure is fine, the local flag holds.
    this.api.dismissAnnouncement(id).subscribe({ error: () => undefined });
  }

  /** Dismiss everything currently active, in one gesture. */
  dismissAll(): void {
    const ids = this.active().map((a) => a.id);
    if (!ids.length) {
      return;
    }
    this.persist([...this.dismissed(), ...ids]);
    if (!this.context().allowed) return;
    for (const id of ids) {
      this.api.dismissAnnouncement(id).subscribe({ error: () => undefined });
    }
  }

  /** Put everything back — the escape hatch for a too-eager "dismiss all". */
  restoreAll(): void {
    this.persist([]);
    // Otherwise the next load would retire them all again straight away.
    writeViews({});
  }

  toggleReaction(a: Announcement, name: string): void {
    const context = this.context();
    if (!context.allowed) return;
    const mine = a.reactions.find((r) => r.name === name)?.me ?? false;
    const call = mine
      ? this.api.removeAnnouncementReaction(a.id, name)
      : this.api.addAnnouncementReaction(a.id, name);
    call.subscribe(() => {
      if (context === this.context()) this.applyReaction(a.id, name, !mine);
    });
  }

  /** Patch the local reaction list after a successful toggle (no refetch). */
  private applyReaction(id: string, name: string, me: boolean): void {
    this.all.update((list) =>
      list.map((x) => {
        if (x.id !== id) {
          return x;
        }
        const reactions = [...x.reactions];
        const idx = reactions.findIndex((r) => r.name === name);
        if (idx === -1) {
          reactions.push({ name, count: 1, me: true, url: null, static_url: null });
        } else {
          const count = reactions[idx].count + (me ? 1 : -1);
          if (count <= 0) {
            reactions.splice(idx, 1);
          } else {
            reactions[idx] = { ...reactions[idx], count, me };
          }
        }
        return { ...x, reactions };
      }),
    );
  }

  private persist(ids: string[]): void {
    const set = new Set(ids);
    this.dismissed.set(set);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
    } catch {
      // Blocked storage: the dismissal holds for this session only.
    }
  }
}

/** The quick picks every announcement offers, whether or not anyone has used them yet. */
export const QUICK_REACTIONS: readonly string[] = ['👍', '🎉', '❤️', '🚀'];

/** One reaction button: an emoji (or custom emoji image) with its count. */
export interface ReactionChip {
  name: string;
  count: number;
  me: boolean;
  /** Image for a custom emoji; null for unicode. */
  url: string | null;
}

/**
 * The server's reactions followed by any quick pick nobody has used yet, each
 * with a count. One row, one button per emoji: quick picks used to sit beside
 * the counted chips without numbers, so a server that returned no reactions
 * looked like a client that forgot to show them.
 */
export function reactionChips(
  a: Announcement,
  quick: readonly string[] = QUICK_REACTIONS,
): ReactionChip[] {
  const chips: ReactionChip[] = (a.reactions ?? []).map((r) => ({
    name: r.name,
    count: typeof r.count === 'number' ? r.count : Number(r.count) || 0,
    me: !!r.me,
    url: r.static_url ?? r.url ?? null,
  }));
  for (const name of quick) {
    if (!chips.some((chip) => chip.name === name))
      chips.push({ name, count: 0, me: false, url: null });
  }
  return chips;
}
