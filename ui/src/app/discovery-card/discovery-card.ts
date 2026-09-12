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
      <img class="avatar" src="/canary_logo_104.png" width="48" height="48" alt="" />
      <div class="body">
        <div class="meta">
          <strong>{{ way().title | transloco }}</strong>
        </div>
        <p class="content">{{ way().description | transloco }}</p>
        <div
          class="card-actions"
          role="group"
          [attr.aria-label]="'discovery.card.actions' | transloco"
        >
          <a
            class="action"
            [routerLink]="way().route"
            [queryParams]="way().query"
            [fragment]="way().fragment"
            >{{ 'discovery.card.explore' | transloco }}</a
          >
          <button type="button" class="action" (click)="dismissed.emit()">
            {{ 'discovery.card.dismiss' | transloco }}
          </button>
        </div>
      </div>
    </aside>
  `,
  styles: `
    :host {
      display: block;
    }
    .discovery-card {
      display: flex;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--accent-soft, var(--bg));
    }
    .avatar {
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 9999px;
      background: var(--border);
      object-fit: cover;
    }
    .body {
      flex: 1;
      min-width: 0;
    }
    .content {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
    }
    .card-actions {
      display: flex;
      flex-wrap: wrap;
      column-gap: 14px;
      row-gap: 8px;
      margin-top: 4px;
      align-items: center;
      min-width: 0;
    }
    .action {
      border: none;
      background: none;
      color: var(--muted);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px;
      cursor: pointer;
      min-height: 20px;
      min-width: 32px;
      justify-content: center;
      position: relative;
      text-decoration: none;
    }
    .action::after {
      content: '';
      position: absolute;
      inset: -4px -2px;
    }
    .action:hover {
      color: var(--accent);
    }
  `,
})
export class DiscoveryCard {
  readonly way = input.required<DiscoveryWay>();
  readonly dismissed = output<void>();
}
