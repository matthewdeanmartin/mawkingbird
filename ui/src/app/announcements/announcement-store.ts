import { computed, inject, Injectable, signal } from '@angular/core';
import { Api } from '../api';
import { Announcement } from '../models';
import { networkSources } from '../shell/network-sources';

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

  /** Everything the server published, dismissed or not. */
  readonly all = signal<Announcement[]>([]);
  readonly loaded = signal(false);

  private dismissed = signal(new Set<string>(readDismissed()));

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

  private loading = false;

  /**
   * Whether this account has a Mastodon server to ask at all.
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
  private usableMastodon = networkSources().usableMastodon;

  load(force = false): void {
    if (this.loading || (this.loaded() && !force)) {
      return;
    }
    // No Mastodon source, no announcements to have. Settle as an empty,
    // *loaded* store so the surfaces render their empty state instead of
    // waiting forever on a request that is never coming.
    if (!this.usableMastodon()) {
      this.loaded.set(true);
      return;
    }
    this.loading = true;
    this.api.announcements().subscribe({
      next: (list) => {
        this.all.set(list);
        this.loaded.set(true);
        this.loading = false;
      },
      error: () => {
        // A server with announcements switched off answers 404; that is an
        // empty list, not a failure worth surfacing.
        this.loaded.set(true);
        this.loading = false;
      },
    });
  }

  isDismissed(id: string): boolean {
    return this.dismissed().has(id);
  }

  dismiss(id: string): void {
    if (this.dismissed().has(id)) {
      return;
    }
    this.persist([...this.dismissed(), id]);
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
    for (const id of ids) {
      this.api.dismissAnnouncement(id).subscribe({ error: () => undefined });
    }
  }

  /** Put everything back — the escape hatch for a too-eager "dismiss all". */
  restoreAll(): void {
    this.persist([]);
  }

  toggleReaction(a: Announcement, name: string): void {
    const mine = a.reactions.find((r) => r.name === name)?.me ?? false;
    const call = mine
      ? this.api.removeAnnouncementReaction(a.id, name)
      : this.api.addAnnouncementReaction(a.id, name);
    call.subscribe(() => this.applyReaction(a.id, name, !mine));
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
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  }
}
