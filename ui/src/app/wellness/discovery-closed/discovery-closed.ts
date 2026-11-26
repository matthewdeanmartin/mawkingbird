import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DiscoveryWindow } from '../discovery-window';
import { WINDOW_LENGTHS, WindowLength } from '../discovery-window-model';
import { safeNext } from '../discovery-guard';

/** English source strings; see scripts/extract-i18n.mjs. */
// i18n wellness.discovery.closed.title: Discovery is closed for now
// i18n wellness.discovery.closed.body: Explore, trends, Good Stuff and public timelines open when you choose to look around. Pick how long, and it opens straight away.
// i18n wellness.discovery.open: Open for
// i18n wellness.discovery.length.minutes: {{count}} minutes
// i18n wellness.discovery.length.day: No limit today
// i18n wellness.discovery.length.dayHint: until 4am
// i18n wellness.discovery.instead: Or read the people you follow:
// i18n wellness.discovery.catchUp: Catch-up
// i18n wellness.discovery.home: Home
// i18n wellness.discovery.settings: Change this in Wellness settings

/**
 * The page a closed discovery route lands on. One tap on a length opens the
 * window and continues to the page that was asked for: no confirm, no timer
 * to sit through. Owner, 2026-11-20: no extra friction.
 */
@Component({
  selector: 'app-discovery-closed',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <section class="closed">
      <h1>{{ 'wellness.discovery.closed.title' | transloco }}</h1>
      <p class="muted">{{ 'wellness.discovery.closed.body' | transloco }}</p>
      <p class="label">{{ 'wellness.discovery.open' | transloco }}</p>
      <div class="lengths">
        @for (length of lengths; track length) {
          <button
            type="button"
            class="btn btn-outline"
            [attr.data-length]="length"
            (click)="openFor(length)"
          >
            @if (length === 'day') {
              {{ 'wellness.discovery.length.day' | transloco }}
              <span class="muted small"
                >({{ 'wellness.discovery.length.dayHint' | transloco }})</span
              >
            } @else {
              {{ 'wellness.discovery.length.minutes' | transloco: { count: length } }}
            }
          </button>
        }
      </div>
      <p class="muted instead">
        {{ 'wellness.discovery.instead' | transloco }}
        <a routerLink="/algo/catch-up">{{ 'wellness.discovery.catchUp' | transloco }}</a> ·
        <a routerLink="/home">{{ 'wellness.discovery.home' | transloco }}</a>
      </p>
      <p class="small">
        <a routerLink="/settings/wellness">{{ 'wellness.discovery.settings' | transloco }}</a>
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .closed {
      max-width: 34rem;
      margin: 0 auto;
      padding: 32px 16px;
      text-align: center;
    }
    h1 {
      font-size: 1.3rem;
    }
    .label {
      margin: 20px 0 8px;
      font-weight: 600;
    }
    .lengths {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
    .instead {
      margin-top: 24px;
    }
  `,
})
export class DiscoveryClosed {
  private window = inject(DiscoveryWindow);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected readonly lengths = WINDOW_LENGTHS;

  protected openFor(length: WindowLength): void {
    this.window.openFor(length);
    void this.router.navigateByUrl(safeNext(this.route.snapshot.queryParamMap.get('next')));
  }
}
