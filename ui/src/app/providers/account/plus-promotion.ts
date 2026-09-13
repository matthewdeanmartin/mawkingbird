import { Component, computed, effect, inject, Injectable, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FeatureFlags } from '../../feature-flags';
import { HouseAdStore } from '../../house-ad-store';
import { PlusBadgeEntitlement } from './plus-badge-entitlement';
import { PlusPrice } from './plus-price';

@Injectable({ providedIn: 'root' })
export class PlusPromotions {
  private flags = inject(FeatureFlags);
  private entitlement = inject(PlusBadgeEntitlement);
  private ads = inject(HouseAdStore);
  private dismissed = signal(false);
  readonly visible = computed(
    () =>
      this.flags.enabled('mawkingbird-plus') &&
      this.entitlement.state() === 'free' &&
      this.ads.enabled() &&
      !this.dismissed(),
  );
  constructor() {
    effect(() => {
      if (this.flags.enabled('mawkingbird-plus')) void this.entitlement.check();
    });
  }
  dismiss(): void {
    this.dismissed.set(true);
  }
}

// i18n plus.promotion.label: From Mawkingbird
// i18n plus.promotion.title: Take your feeds with you
// i18n plus.promotion.body: Sync your feeds and settings across devices with Mawkingbird Plus.
// i18n plus.promotion.railTitle: Support Mawkingbird
// i18n plus.promotion.railBody: Help keep Mawkingbird going and get cross-device sync with Plus.
// i18n plus.promotion.action: Explore Mawkingbird Plus
// i18n plus.promotion.dismiss: Hide Plus recommendations for this session
@Component({
  selector: 'app-plus-promotion',
  imports: [RouterLink, TranslocoPipe, PlusPrice],
  template: `
    @if (promotions.visible()) {
      <aside
        class="plus-recommendation"
        [class.rail]="placement() === 'rail'"
        [attr.aria-label]="'plus.promotion.label' | transloco"
      >
        <small>{{ 'plus.promotion.label' | transloco }}</small>
        <strong>{{
          (placement() === 'rail' ? 'plus.promotion.railTitle' : 'plus.promotion.title') | transloco
        }}</strong>
        <p>
          {{
            (placement() === 'rail' ? 'plus.promotion.railBody' : 'plus.promotion.body') | transloco
          }}
        </p>
        <app-plus-price />
        <div class="actions">
          <a routerLink="/settings/mawkingbird-plus">{{ 'plus.promotion.action' | transloco }}</a>
          <button type="button" (click)="promotions.dismiss()">
            {{ 'plus.promotion.dismiss' | transloco }}
          </button>
        </div>
      </aside>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .plus-recommendation {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      background: var(--accent-soft, var(--bg));
    }
    .rail {
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 16px;
    }
    small,
    strong {
      display: block;
    }
    small {
      color: var(--muted);
      margin-bottom: 6px;
    }
    p {
      margin: 8px 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
      align-items: center;
    }
    button {
      font: inherit;
      color: var(--muted);
      background: transparent;
      border: 0;
      text-align: left;
      padding: 0;
      cursor: pointer;
      text-decoration: underline;
    }
  `,
})
export class PlusPromotion {
  readonly placement = input<'feed' | 'rail'>('feed');
  readonly promotions = inject(PlusPromotions);
}
