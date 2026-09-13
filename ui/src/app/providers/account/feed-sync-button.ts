import { Component, inject, Injector, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlusPaywall } from './plus-paywall';
import { FeatureFlags } from '../../feature-flags';
import type { CollectionAdoptionRunner } from './collection-adoption-runner';

// i18n plus.feedSync.button: Sync feeds across devices
// i18n plus.feedSync.choice: Feeds exist both here and on your account. Merge keeps both sets; the account copy wins when a feed differs.
// i18n plus.feedSync.merge: Merge feeds
// i18n plus.feedSync.replace: Use account feeds
// i18n plus.feedSync.done: Feed subscriptions synced.
// i18n plus.feedSync.failed: Feed sync did not complete. Please retry.
@Component({
  selector: 'app-feed-sync-button',
  imports: [TranslocoPipe],
  template: `@if (flags.enabled('mawkingbird-plus')) {
    <button class="btn btn-outline" type="button" [disabled]="busy()" (click)="sync()">
      {{ 'plus.feedSync.button' | transloco }}
    </button>
    @if (choice()) {
      <p>{{ 'plus.feedSync.choice' | transloco }}</p>
      <button class="btn" type="button" [disabled]="busy()" (click)="apply('merge')">
        {{ 'plus.feedSync.merge' | transloco }}
      </button>
      <button class="btn btn-outline" type="button" [disabled]="busy()" (click)="apply('replace')">
        {{ 'plus.feedSync.replace' | transloco }}
      </button>
    }
    @if (message()) {
      <p role="status">{{ message() | transloco }}</p>
    }
  }`,
})
export class FeedSyncButton {
  readonly flags = inject(FeatureFlags);
  private wall = inject(PlusPaywall);
  private injector = inject(Injector);
  readonly busy = signal(false);
  readonly choice = signal(false);
  readonly message = signal('');
  private runner: CollectionAdoptionRunner | null = null;
  async sync(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.choice.set(false);
    try {
      if (!(await this.wall.require('feeds'))) return;
      const { CollectionAdoptionRunner } = await import('./collection-adoption-runner');
      this.runner = this.injector.get(CollectionAdoptionRunner);
      const result = await this.runner.inspect('feeds');
      this.choice.set(result.needsChoice);
      this.message.set(result.error ?? (result.needsChoice ? '' : 'plus.feedSync.done'));
    } catch {
      this.message.set('plus.feedSync.failed');
    } finally {
      this.busy.set(false);
    }
  }
  async apply(choice: 'merge' | 'replace'): Promise<void> {
    if (!this.runner || this.busy()) return;
    this.busy.set(true);
    try {
      if (!(await this.wall.require('feeds'))) return;
      const ok = await this.runner.apply('feeds', choice);
      this.choice.set(!ok);
      this.message.set(ok ? 'plus.feedSync.done' : 'plus.feedSync.failed');
    } catch {
      this.message.set('plus.feedSync.failed');
    } finally {
      this.busy.set(false);
    }
  }
}
