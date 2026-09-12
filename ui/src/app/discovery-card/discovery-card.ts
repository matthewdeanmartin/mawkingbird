import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DiscoveryWay } from '../discovery-ways';

// i18n discovery.card.heading: Find more people to follow
// i18n discovery.card.explore: Explore
// i18n discovery.card.dismiss: Dismiss this card
// i18n discovery.card.actions: Discovery card actions
@Component({
  selector: 'app-discovery-card',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <aside class="discovery-card" [attr.aria-label]="'discovery.card.heading' | transloco">
      <p class="muted small">{{ 'discovery.card.heading' | transloco }}</p>
      <h2>{{ way().title | transloco }}</h2>
      <p>{{ way().description | transloco }}</p>
      <div
        class="card-actions"
        role="group"
        [attr.aria-label]="'discovery.card.actions' | transloco"
      >
        <a
          class="btn"
          [routerLink]="way().route"
          [queryParams]="way().query"
          [fragment]="way().fragment"
          >{{ 'discovery.card.explore' | transloco }}</a
        >
        <button type="button" class="btn btn-outline" (click)="dismissed.emit()">
          {{ 'discovery.card.dismiss' | transloco }}
        </button>
      </div>
    </aside>
  `,
  styles: `
    :host {
      display: block;
    }
    .discovery-card {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      background: var(--accent-soft, var(--bg));
    }
    h2 {
      margin: 8px 0;
      font-size: 1.1rem;
    }
    p {
      margin: 0 0 12px;
    }
    .card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class DiscoveryCard {
  readonly way = input.required<DiscoveryWay>();
  readonly dismissed = output<void>();
}
