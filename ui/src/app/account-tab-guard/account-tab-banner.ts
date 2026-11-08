import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { AccountTabGuard } from './account-tab-guard';

// i18n accountTab.otherTab: This tab is still signed in as {{loaded}}, but another tab switched to {{active}}. Likes, boosts, replies and posts are paused here so nothing goes out from the wrong account.
// i18n accountTab.restored: This tab was showing {{loaded}} before it reloaded, and is now signed in as {{active}}. Likes, boosts, replies and posts are paused until you choose.
// i18n accountTab.unknownAccount: a different account
// i18n accountTab.reload: Reload as {{active}}
// i18n accountTab.continue: Continue as {{active}}

/** Explains why this tab will not write, and offers the way out. */
@Component({
  selector: 'app-account-tab-banner',
  imports: [MbButton, TranslocoPipe],
  template: `
    @if (guard.conflict(); as conflict) {
      @let loaded = conflict.loadedAs ? '@' + conflict.loadedAs : ('accountTab.unknownAccount' | transloco);
      @let active = conflict.activeAs ? '@' + conflict.activeAs : ('accountTab.unknownAccount' | transloco);
      <div class="account-tab-banner" role="alert">
        <p>
          {{
            (conflict.reason === 'restored' ? 'accountTab.restored' : 'accountTab.otherTab')
              | transloco: { loaded, active }
          }}
        </p>
        <div class="actions">
          @if (conflict.reason === 'restored') {
            <button mbButton type="button" size="small" (click)="guard.continueAsActive()">
              {{ 'accountTab.continue' | transloco: { active } }}
            </button>
          } @else {
            <button mbButton type="button" size="small" (click)="guard.reload()">
              {{ 'accountTab.reload' | transloco: { active } }}
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .account-tab-banner {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--col-bg);
      color: var(--text);
      font-size: 14px;
    }
    p {
      margin: 0;
      flex: 1 1 240px;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
  `,
})
export class AccountTabBanner {
  protected guard = inject(AccountTabGuard);
}
