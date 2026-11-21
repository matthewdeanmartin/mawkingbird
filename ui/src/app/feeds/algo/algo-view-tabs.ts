import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import { Wellness } from '../../wellness/wellness';

// i18n pages.algo.views.label: Algo views
// i18n pages.algo.views.goodStuff: Good Stuff
// i18n pages.algo.views.relationships: Relationships
// i18n pages.algo.views.catchUp: Catch-up

export type AlgoView = 'goodStuff' | 'relationships' | 'catchUp';

const ROUTES: Record<AlgoView, string> = {
  goodStuff: '/algo',
  relationships: '/algo/people',
  catchUp: '/algo/catch-up',
};

/**
 * Algo's view picker: a dropdown, because the views kept growing and three
 * route tabs (with long translated names) no longer fit a phone row.
 *
 * - Good Stuff leaves the list when Wellness demotes it; it stays reachable
 *   from Feeds, and while you are on it it is still listed so the picker can
 *   say where you are.
 * - Relationships reads Native's local archive, so the web never lists it.
 * - Catch-up needs someone to follow, so signed-in only.
 */
@Component({
  selector: 'app-algo-view-tabs',
  imports: [TranslocoPipe],
  template: `
    @if (views().length > 1) {
      <nav class="views" [attr.aria-label]="'pages.algo.views.label' | transloco">
        <label>
          <span class="label">{{ 'pages.algo.views.label' | transloco }}</span>
          <select name="algo_view" [value]="view()" (change)="go($any($event.target).value)">
            @for (option of views(); track option) {
              <option [value]="option" [selected]="option === view()">
                {{ 'pages.algo.views.' + option | transloco }}
              </option>
            }
          </select>
        </label>
      </nav>
    }
  `,
  styles: `
    .views {
      display: flex;
      justify-content: flex-end;
      padding: 8px 14px;
      border-bottom: 1px solid var(--border);
    }
    label {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      font: 600 14px / 1.4 var(--app-font-family);
    }
    .label {
      color: var(--muted, inherit);
      font-weight: 400;
    }
    select {
      font: inherit;
    }
  `,
})
export class AlgoViewTabs {
  readonly view = input.required<AlgoView>();
  private router = inject(Router);
  private auth = inject(Auth);
  private wellness = inject(Wellness);
  private native = inject(NATIVE_PROFILES) !== null;

  protected readonly views = computed<AlgoView[]>(() => {
    const signedIn = !this.auth.isAnonymous;
    const list: AlgoView[] = [];
    if (!this.wellness.demoteGoodStuff() || this.view() === 'goodStuff') list.push('goodStuff');
    if (this.native && this.auth.kind() === 'mastodon' && !!this.auth.token()) {
      list.push('relationships');
    }
    if (signedIn) list.push('catchUp');
    return list;
  });

  protected go(view: AlgoView): void {
    if (view !== this.view()) void this.router.navigateByUrl(ROUTES[view]);
  }
}
