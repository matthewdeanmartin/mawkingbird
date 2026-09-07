import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AnalyticsTracker } from './analytics-tracker';
import { ClientPrefs } from './client-prefs';
import { FailWhale } from './fail-whale/fail-whale';
import { InstanceStatus } from './instance-status';
import { RouteLog } from './observability/route-log';
import { ServerHealth } from './server-health';
import { UpdateOverlay } from './update-overlay/update-overlay';
import { UpdateRecovery } from './update-recovery';
import { ConfigSync } from './config-sync';
import { ProfileSyncStarter } from './providers/account/profile-sync-starter';
import { ActionTracker } from './action-tracker';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FailWhale, UpdateOverlay],
  template: `
    <router-outlet />
    @if (health.down()) {
      <app-fail-whale />
    }
    <app-update-overlay />
  `,
})
export class App {
  protected readonly health = inject(ServerHealth);
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
