import { ReadingOutlet } from './shell/reading-outlet';
import { Component, Injector, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AnalyticsTracker } from './platform/diagnostics/analytics-tracker';
import { ClientPrefs } from './platform/storage/client-prefs';
import { FailWhale } from './shell/fail-whale/fail-whale';
import { InstanceStatus } from './platform/http/instance-status';
import { RouteLog } from './observability/route-log';
import { ConnectionState } from './platform/network/connection-state';
import { OfflineBanner } from './shell/offline-banner/offline-banner';
import { UpdateOverlay } from './shell/update-overlay/update-overlay';
import { OfflineApp } from './platform/offline/offline-app';
import { LiteMode } from './lite/lite-mode';
import { OutboxSummary } from './platform/offline/outbox-summary';
import { UpdateRecovery } from './platform/build/update-recovery';
import { ConfigSync } from './platform/storage/config-sync';
import { ProfileSyncStarter } from './accounts/mawkingbird/profile-sync-starter';
import { ActionTracker } from './platform/diagnostics/action-tracker';

@Component({
  selector: 'app-root',
  imports: [ReadingOutlet, RouterOutlet, FailWhale, OfflineBanner, UpdateOverlay],
  template: `
    <router-outlet mbReadingOutlet />
    @if (connection.surface() === 'whale') {
      <app-fail-whale />
    }
    <app-offline-banner />
    <app-update-overlay />
  `,
})
export class App {
  /**
   * Whale, offline banner or nothing. The whale used to follow ServerHealth
   * alone, which blamed the server for the reader's dead Wi-Fi; see
   * spec/low-bandwidth-offline.md (Sprint 2).
   */
  protected readonly connection = inject(ConnectionState);
  /** Instantiated eagerly so theme/accent apply on every route, including login. */
  private readonly prefs = inject(ClientPrefs);
  /** Instantiated eagerly so status-page discovery runs while the instance is healthy. */
  private readonly instanceStatus = inject(InstanceStatus);
  private readonly recovery = inject(UpdateRecovery);
  private readonly analytics = inject(AnalyticsTracker);
  private readonly routeLog = inject(RouteLog);
  /** Checks an explicitly configured remote client config when its cadence is due. */
  private readonly configSync = inject(ConfigSync);
  /**
   * Settings sync for a Mawkingbird Plus account.
   *
   * Behind a starter rather than injected directly: `ProfileSync` reaches
   * `MawkingbirdSession`, and pulling that into the root component would put the
   * whole account machinery in the initial bundle for every visitor — including
   * the anonymous github.io deployment, where there are no accounts at all.
   */
  private readonly profileSync = inject(ProfileSyncStarter);
  /** The offline app shell (service worker); registers a few seconds after start. */
  private readonly offlineApp = inject(OfflineApp);
  private readonly lite = inject(LiteMode);
  private readonly outboxSummary = inject(OutboxSummary);
  private readonly injector = inject(Injector);
  /** Privacy-scrubbed intent log for buttons, links, submits, and committed changes. */
  private readonly actions = inject(ActionTracker);

  constructor() {
    // Count page views on every router navigation (GoatCounter, no_onload).
    this.analytics.start();
    // The user's own copy of the same idea: per-route visits and time spent,
    // kept locally for the Observability page and never sent anywhere.
    this.routeLog.start();
    this.actions.start();
    // Arm the deployment-recovery loop guard: if we got here after an
    // auto-reload, clear it once we've run cleanly for a bit.
    this.recovery.markApplicationStableAfterDelay();
    this.configSync.start();
    this.offlineApp.start();
    // Lite: entering /m/ turns it on; while on, full-app links open their /m/ twin.
    this.lite.start();
    // The Outbox service needs the API client; load it only when something
    // is actually queued. Compose loads it itself when it queues a post.
    if (this.outboxSummary.waiting() + this.outboxSummary.held() > 0) {
      void import('./publishing/outbox/outbox').then((m) => this.injector.get(m.Outbox));
    }
    // Never awaited: sync settling is not something application start should
    // wait on, and the starter swallows its own failures.
    void this.profileSync.start();
    // Catches the other-machine case without polling. Rate-limited inside
    // `recheckOnFocus` to once every few minutes, so tabbing back and forth
    // costs nothing.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.profileSync.recheckOnFocus();
      }
    });
  }
}
