import { Component, effect, ElementRef, HostListener, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlusPaywall } from './plus-paywall';
import { PlusPrice } from './plus-price';
import { ProxyActivity } from '../cors-proxy/proxy-activity';

// i18n plus.wall.settings: Your settings, on every device
// i18n plus.wall.feeds: Take your feeds with you
// i18n plus.wall.connections: Your connections, on every device
// i18n plus.wall.proxy: Need a higher proxy allowance?
// i18n plus.wall.settingsBody: Get Plus to keep your Mawkingbird setup in sync. You can keep using settings on this device for free.
// i18n plus.wall.feedsBody: Get Plus to sync feed subscriptions across devices. Reading and managing feeds on this device stays free.
// i18n plus.wall.connectionsBody: Get Plus to sync stored connections. Connecting services on this device stays free.
// i18n plus.wall.proxyBody: The free proxy has reached its request limit. Plus provides a higher allowance. You can also wait, or disable features that need the proxy.
// i18n plus.wall.affected: Disabling stops proxied feed updates, article fetching, paste-site requests, link shortening and publishing that use the proxy. Direct connections and saved data remain available. Re-enable in connection settings.
// i18n plus.wall.checking: Checking your membership…
// i18n plus.wall.unavailable: We could not check your membership. Please retry.
// i18n plus.wall.get: Get Plus
// i18n plus.wall.signUp: Sign up for Plus
// i18n plus.wall.dismiss: Not now
// i18n plus.wall.disable: Disable features that need proxy
// i18n plus.wall.already: Already subscribed? Sign in
// i18n plus.wall.notice: The proxy reached its request limit. Wait before retrying or review your connection settings.
// i18n plus.wall.paused: Features that need the proxy are disabled on this device.
// i18n plus.wall.connectionsLink: Connection settings
@Component({
  selector: 'app-plus-paywall-dialog',
  imports: [TranslocoPipe, RouterLink, PlusPrice],
  template: ` @if (activity.notice() || activity.paused()) {
      <p class="muted small" role="status">
        {{ (activity.paused() ? 'plus.wall.paused' : 'plus.wall.notice') | transloco }}
        <a routerLink="/settings/connections/cors-proxy">{{
          'plus.wall.connectionsLink' | transloco
        }}</a>
        @if (wall.available()) {
          <button type="button" class="btn btn-outline" (click)="wall.require('proxy')">
            {{ 'plus.wall.get' | transloco }}
          </button>
        }
      </p>
    }
    <dialog #dialog (cancel)="wall.dismiss()" aria-labelledby="plus-wall-title">
      @if (wall.state(); as state) {
        <h2 id="plus-wall-title">{{ titles[state.feature] | transloco }}</h2>
        @if (state.status === 'checking') {
          <p role="status">{{ 'plus.wall.checking' | transloco }}</p>
        } @else if (state.status === 'unavailable') {
          <p role="status">{{ 'plus.wall.unavailable' | transloco }}</p>
          <button class="btn" type="button" (click)="wall.retry()">
            {{ 'plus.price.retry' | transloco }}
          </button>
        } @else {
          <p>{{ bodies[state.feature] | transloco }}</p>
          <p><app-plus-price /></p>
          <button
            class="btn"
            type="button"
            [disabled]="!wall.catalogue.offer()"
            (click)="wall.upgrade()"
          >
            {{ (state.feature === 'proxy' ? 'plus.wall.signUp' : 'plus.wall.get') | transloco }}
          </button>
          <button class="btn btn-outline" type="button" (click)="wall.upgrade(false)">
            {{ 'plus.wall.already' | transloco }}
          </button>
          @if (state.feature === 'proxy') {
            <p>{{ 'plus.wall.affected' | transloco }}</p>
            <button class="btn btn-outline" type="button" (click)="disableProxy()">
              {{ 'plus.wall.disable' | transloco }}
            </button>
          }
        }
        <button class="btn btn-outline" type="button" (click)="wall.dismiss()">
          {{ 'plus.wall.dismiss' | transloco }}
        </button>
      }
    </dialog>`,
  styles: [
    `
      dialog {
        width: min(32rem, calc(100vw - 2rem));
        max-height: 85vh;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 1rem;
        padding: 1.5rem;
        background: var(--bg, white);
        color: var(--text, black);
      }
      dialog::backdrop {
        background: #0008;
      }
      dialog button,
      dialog a {
        margin: 0.4rem 0.5rem 0.4rem 0;
      }
    `,
  ],
})
export class PlusPaywallDialog {
  readonly titles = {
    settings: 'plus.wall.settings',
    feeds: 'plus.wall.feeds',
    connections: 'plus.wall.connections',
    proxy: 'plus.wall.proxy',
  };
  readonly bodies = {
    settings: 'plus.wall.settingsBody',
    feeds: 'plus.wall.feedsBody',
    connections: 'plus.wall.connectionsBody',
    proxy: 'plus.wall.proxyBody',
  };

  readonly wall = inject(PlusPaywall);
  readonly activity = inject(ProxyActivity);
  private dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private previous: HTMLElement | null = null;
  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.wall.state()) {
        if (!dialog.open) {
          this.previous = document.activeElement as HTMLElement;
          dialog.showModal();
        }
      } else if (dialog.open) {
        dialog.close();
        this.previous?.focus();
      }
    });
    effect(() => {
      this.activity.prompt();
      this.wall.state();
      this.offerProxy();
    });
  }
  @HostListener('document:visibilitychange')
  offerProxy(): void {
    if (document.visibilityState === 'visible' && !this.wall.state() && this.activity.claimPrompt())
      void this.wall.require('proxy');
  }
  disableProxy(): void {
    this.activity.setPaused(true);
    this.wall.dismiss();
  }
}
