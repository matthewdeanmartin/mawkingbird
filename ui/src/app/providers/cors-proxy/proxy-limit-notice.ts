import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FeatureFlags } from '../../feature-flags';
import { PlusBadgeEntitlement } from '../account/plus-badge-entitlement';
import { PlusPrice } from '../account/plus-price';
import { ProxyActivity } from './proxy-activity';

// i18n proxy.limit.title: Some updates are paused
// i18n proxy.limit.body: A temporary request limit was reached. Your saved content is still available.
// i18n proxy.limit.offerTitle: Get a higher allowance with Plus
// i18n proxy.limit.offerBody: You’ve temporarily reached the free request limit. Mawkingbird Plus provides a higher allowance.
// i18n proxy.limit.networkBody: Your network has temporarily reached its shared free request limit. Plus provides a higher allowance for your account.
// i18n proxy.limit.retry: Try again in about {{seconds}} seconds.
// i18n proxy.limit.explore: Explore Plus
// i18n proxy.limit.dismiss: Dismiss
// i18n proxy.limit.notNow: Not now
@Component({
  selector: 'app-proxy-limit-notice',
  imports: [RouterLink, TranslocoPipe, PlusPrice],
  template: `
    @if (activity.notice() && !activity.paused()) {
      <aside
        class="limit-notice"
        [class.toast]="!showOffer()"
        aria-label="{{ 'proxy.limit.title' | transloco }}"
      >
        <div role="status">
          <strong>{{
            (showOffer() ? 'proxy.limit.offerTitle' : 'proxy.limit.title') | transloco
          }}</strong>
          <p>
            {{
              (showOffer()
                ? activity.details()?.identity === 'ip'
                  ? 'proxy.limit.networkBody'
                  : 'proxy.limit.offerBody'
                : 'proxy.limit.body'
              ) | transloco
            }}
          </p>
        </div>
        @if (showOffer()) {
          <app-plus-price />
        }
        <!-- Keep the changing countdown out of the live region. -->
        <p class="small muted">
          {{ 'proxy.limit.retry' | transloco: { seconds: activity.remainingSeconds() } }}
        </p>
        <div class="actions">
          @if (showOffer()) {
            <a
              class="btn"
              routerLink="/settings/mawkingbird-plus"
              (click)="activity.dismissNotice()"
              >{{ 'proxy.limit.explore' | transloco }}</a
            >
          }
          <button class="btn btn-outline" type="button" (click)="activity.dismissNotice()">
            {{ (showOffer() ? 'proxy.limit.notNow' : 'proxy.limit.dismiss') | transloco }}
          </button>
        </div>
      </aside>
    }
  `,
  styles: `
    .limit-notice {
      padding: 1rem;
      margin: 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--accent-soft, var(--bg));
      color: var(--text);
    }
    .toast {
      position: fixed;
      inset-inline-end: 1rem;
      bottom: calc(1rem + env(safe-area-inset-bottom));
      z-index: 100;
      width: min(28rem, calc(100vw - 2rem));
      box-sizing: border-box;
      max-height: 50vh;
      overflow: auto;
      margin: 0;
      background: var(--bg);
      box-shadow: 0 4px 16px #0003;
    }
    p {
      margin: 0.5rem 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
  `,
})
export class ProxyLimitNotice {
  readonly activity = inject(ProxyActivity);
  private flags = inject(FeatureFlags);
  private entitlement = inject(PlusBadgeEntitlement);
  private offered = signal(false);
  private eligible = computed(
    () =>
      this.flags.enabled('mawkingbird-plus') &&
      this.activity.upgradeEligible() &&
      this.entitlement.state() === 'free',
  );
  readonly showOffer = computed(() => this.offered() && this.eligible());

  constructor() {
    effect(() => {
      if (!this.activity.notice() || this.activity.paused()) {
        this.offered.set(false);
        return;
      }
      if (this.flags.enabled('mawkingbird-plus')) void this.entitlement.check();
      // Claim the session's offer only when it can actually be displayed.
      if (!this.offered() && this.eligible() && this.activity.claimPrompt()) this.offered.set(true);
    });
  }
}
