import { Component, inject, Injector, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlusPaywall } from './plus-paywall';
import { VaultPreference } from '../vault/vault-preference';
import { FeatureFlags } from '../../feature-flags';

// i18n plus.connectionSync.button: Sync connections
// i18n plus.connectionSync.unlock: Set up or unlock stored connections to continue.
// i18n plus.connectionSync.open: Open stored connection settings
// i18n plus.connectionSync.done: Stored connections synced.
// i18n plus.connectionSync.failed: Some connections could not be synced. Review stored connection settings before retrying.
@Component({
  selector: 'app-connection-sync-button',
  imports: [TranslocoPipe, RouterLink],
  template: `@if (preference.available && flags.enabled('mawkingbird-plus')) {
    <button class="btn btn-outline" type="button" [disabled]="busy()" (click)="sync()">
      {{ 'plus.connectionSync.button' | transloco }}
    </button>
    @if (message()) {
      <p role="status">{{ message() | transloco }}</p>
    }
    @if (needsAttention()) {
      <a routerLink="/settings/mawkingbird-plus">{{ 'plus.connectionSync.open' | transloco }}</a>
    }
  }`,
})
export class ConnectionSyncButton {
  readonly preference = inject(VaultPreference);
  readonly flags = inject(FeatureFlags);
  private wall = inject(PlusPaywall);
  private injector = inject(Injector);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly needsAttention = signal(false);
  async sync(): Promise<void> {
    if (this.busy() || !this.preference.available) return;
    this.busy.set(true);
    this.message.set('');
    this.needsAttention.set(false);
    try {
      if (!(await this.wall.require('connections'))) return;
      const [{ VaultService }, { VaultAdoption }] = await Promise.all([
        import('../vault/vault-service'),
        import('../vault/vault-adoption'),
      ]);
      const vault = this.injector.get(VaultService);
      this.preference.set(true);
      await vault.refresh();
      if (!vault.unlocked()) {
        this.message.set('plus.connectionSync.unlock');
        this.needsAttention.set(true);
        return;
      }
      const result = await this.injector.get(VaultAdoption).reconcileExisting();
      const failed = result.failed.length > 0 || result.conflicts.length > 0;
      this.message.set(failed ? 'plus.connectionSync.failed' : 'plus.connectionSync.done');
      this.needsAttention.set(failed);
    } catch {
      this.message.set('plus.connectionSync.failed');
      this.needsAttention.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
