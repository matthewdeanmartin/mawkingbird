import {
  Component,
  computed,
  effect,
  inject,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbRailCard } from '../../design-system/identity/rail-card';
import { HumanTimePipe } from '../../i18n/human-time.pipe';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { Auth } from '../../platform/session/auth';
import { ScreenShare } from '../../shell/screen-share/screen-share';
import { DraftItem } from './draft-items';
import { DraftSources } from './draft-sources';

// i18n draftsRail.title: Your drafts
// i18n draftsRail.count.one: {{count}} waiting
// i18n draftsRail.count.other: {{count}} waiting
// i18n draftsRail.untitled: (empty draft)
// i18n draftsRail.all: All drafts

/** Drafts the card lists before "All drafts". */
export const RAIL_DRAFTS = 3;

/**
 * Account scopes the server-backed sources were loaded for this session.
 * Module state: the card is re-created on every page, the session is not.
 */
const loadedScopes = new Set<string>();

/** For tests: forget which accounts were loaded. */
export function resetDraftsRailLoads(): void {
  loadedScopes.clear();
}

/**
 * Left rail under the profile, Fedi and Explore (spec/sprint/explore-2026-11.md): your
 * drafts, as a quiet nudge to finish one. Shows nothing without drafts. No
 * dots, badges or reminders: it is a card, not a notification.
 *
 * Local drafts and pastes are signals over storage and show at once. The two
 * server sources (parked schedules, notes to self) cost two requests, so they
 * load once per account per session, never on navigation, and never for
 * Anonymous. The shell renders this under `@defer (on idle)`.
 */
@Component({
  selector: 'app-drafts-rail-card',
  imports: [HumanTimePipe, MbRailCard, RouterLink, TranslocoPipe],
  template: `
    @if (!screenShare.enabled() && total()) {
      <section mbRailCard class="card">
        <h2 class="card-title">
          {{ 'draftsRail.title' | transloco }}
          <span class="muted">{{
            (total() === 1 ? 'draftsRail.count.one' : 'draftsRail.count.other')
              | transloco: { count: total() }
          }}</span>
        </h2>
        <ul>
          @for (item of recent(); track item.key) {
            <li>
              <a [routerLink]="link(item).path" [queryParams]="link(item).query">
                <span class="name">{{ item.preview || ('draftsRail.untitled' | transloco) }}</span>
                <span class="muted">{{ item.at | humanTime }}</span>
              </a>
            </li>
          }
        </ul>
        <a class="more" routerLink="/drafts">{{ 'draftsRail.all' | transloco }}</a>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    /* The left rail's card styles do not reach inside this component, so the
       card spaces itself like its neighbours (title, rows, footer link). */
    .card {
      margin-bottom: 12px;
    }
    .card-title {
      border-bottom: 1px solid var(--border);
      font-size: 17px;
      font-weight: 700;
      margin: 0;
      padding: 12px 14px;
    }
    ul {
      display: grid;
      gap: 0.35rem;
      list-style: none;
      margin: 0;
      padding: 10px 14px;
    }
    li a {
      align-items: baseline;
      color: inherit;
      display: flex;
      gap: 0.4rem;
      text-decoration: none;
    }
    li a:hover .name,
    li a:focus-visible .name {
      text-decoration: underline;
    }
    .name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .muted {
      color: var(--muted);
      font-size: 0.85rem;
      font-weight: normal;
    }
    .more {
      border-top: 1px solid var(--border);
      color: var(--ds-action-text);
      display: block;
      font-size: 13px;
      font-weight: 700;
      padding: 10px 14px;
    }
  `,
})
export class DraftsRailCard {
  protected readonly screenShare = inject(ScreenShare);
  private sources = inject(DraftSources);
  private auth = inject(Auth);

  protected readonly total = computed(() => this.sources.items().length);
  protected readonly recent = computed(() => this.sources.items().slice(0, RAIL_DRAFTS));

  constructor() {
    effect(() => {
      // Re-run on an account switch: each account loads its own once.
      this.auth.account();
      if (this.auth.isAnonymous || !this.auth.isAuthenticated) return;
      const scope = accountScopeSuffix();
      if (loadedScopes.has(scope)) return;
      loadedScopes.add(scope);
      untracked(() => this.sources.load());
    });
  }

  /**
   * Where a draft is picked up: a local draft opens in the Home composer, as
   * the Drafts page's Continue does; the other kinds open the Drafts page,
   * which offers their own actions.
   */
  protected link(item: DraftItem): { path: string; query: Record<string, string> | null } {
    return item.kind === 'local'
      ? { path: '/home', query: { draft: item.id } }
      : { path: '/drafts', query: null };
  }
}
