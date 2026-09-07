import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { failWhaleArt } from '../build-flavor';
import { BuildInfo, BUILD_INFO } from '../build-info';
import { ClientPrefs } from '../client-prefs';
import { BugReportDialog } from '../bug-report-dialog/bug-report-dialog';
import { InstanceStatus } from '../instance-status';
import { ServerHealth } from '../server-health';
import { ServerPicker } from '../server-picker/server-picker';
import { Auth } from '../auth';
import { PageDiagnostics } from '../page-diagnostics';

/**
 * Full-screen overlay shown when the API server is unreachable. Recovery is on
 * demand: the user clicks "Try again", which pings the server once. There is no
 * background polling. When the unreachable instance has a known status page
 * (curated, administrator-provided, or third-party monitoring — see
 * {@link InstanceStatus}), a link to it is offered.
 *
 * Anonymous browsing isn't tied to any one instance, so if the anonymous user's
 * chosen server is the thing that's down (e.g. a network blocking
 * mastodon.social), the whale also offers the login page's instance picker to
 * hop to a reachable server without leaving the app.
 *
 * Below all of that sits the **details box**: the actual error, the request that
 * produced it, and the context needed to tell "my network" apart from "their
 * server". Nobody else is going to look at this — no SRE is paged when a
 * client-side app can't reach a public instance — so the person in front of the
 * screen gets the raw material to troubleshoot, plus a route to the connection
 * doctor in case the instance isn't the culprit at all.
 */
// i18n failWhale.domainUnavailable: {{domain}} appears to be unavailable
// i18n failWhale.cantReachServer: Can't reach the server
// i18n failWhale.noReply: No reply came back at all. Your connection may be down, the instance may be unreachable from here, or something between the two may be blocking it.
// i18n failWhale.checking: Checking…
// i18n failWhale.tryAgain: Try again
// i18n failWhale.reportThis: Report this
// i18n failWhale.offlineNote: Your browser reports that this device is <strong>offline</strong>. Check your network connection before blaming the server.
// i18n failWhale.orBrowse: Or browse a different instance:
// i18n failWhale.whatWentWrong: What went wrong?
// i18n failWhale.error: Error
// i18n failWhale.status: Status
// i18n failWhale.statusZero: <code>0</code> — no response reached the browser
// i18n failWhale.request: Request
// i18n failWhale.server: Server
// i18n failWhale.unknown: unknown
// i18n failWhale.time: Time
// i18n failWhale.network: Network
// i18n failWhale.reportedOnline: Browser reported online
// i18n failWhale.reportedOffline: Browser reported offline
// i18n failWhale.build: Build
// i18n failWhale.noDetails: No error details were recorded. The server was marked unreachable without a specific failure to report.
// i18n failWhale.notServerHint: It may not be the server at all — a proxy, DNS, or browser extension can produce exactly this. The connection doctor checks each of those in turn.
// i18n failWhale.openDoctor: Open connection doctor
// i18n failWhale.copied: Copied
// i18n failWhale.copyDetails: Copy details
@Component({
  selector: 'app-fail-whale',
  imports: [BugReportDialog, ServerPicker, RouterLink, TranslocoPipe],
  templateUrl: './fail-whale.html',
  styleUrl: './fail-whale.css',
})
export class FailWhale {
  protected health = inject(ServerHealth);
  protected status = inject(InstanceStatus);
  private auth = inject(Auth);
  private prefs = inject(ClientPrefs);
  private diagnostics = inject(PageDiagnostics);
  /** The whale drawing and its shape — see {@link failWhaleArt}. */
  protected whale = computed(() => failWhaleArt(this.prefs.artStyle()));
  protected reporting = signal(false);
  /** Details box starts closed — it's for the curious, not the first thing read. */
  protected detailsOpen = signal(false);
  protected readonly build: BuildInfo = BUILD_INFO;
  protected copied = signal(false);

  /**
   * The browser thinks it has no network at all. Worth calling out loudly: it
   * reframes the whole page from "that instance is broken" to "you're offline",
   * which is a completely different thing to go fix.
   */
  protected readonly offline = computed(() => this.health.failure()?.online === false);

  /** One pasteable block for a forum post or bug report. */
  protected diagnosticsText(): string {
    const f = this.health.failure();
    const lines = [
      `Server:  ${this.status.currentDomain() || '(unknown)'}`,
      `Status:  ${f ? (f.status === 0 ? '0 (no response)' : f.status) : '(none recorded)'}`,
      `Request: ${f?.url ?? '(none recorded)'}`,
      `Error:   ${f?.message ?? '(none recorded)'}`,
      `Time:    ${f?.at.toISOString() ?? '(none recorded)'}`,
      `Online:  ${f ? f.online : navigator.onLine}`,
      `Build:   ${this.build.commit ?? 'dev'}`,
    ];
    return lines.join('\n');
  }

  protected async copyDiagnostics(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.diagnosticsText());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (error: unknown) {
      this.diagnostics.error('FailWhale', 'clipboard:error', error);
      // Clipboard denied (insecure context, permissions). The text is on screen
      // and selectable anyway, so there is nothing to recover from.
    }
  }

  /** Only anonymous users can freely change instance from here — an authenticated
   *  session belongs to a specific server, so switching isn't a recovery for them. */
  protected get canChangeServer(): boolean {
    return this.auth.isAnonymous;
  }

  retry(): void {
    this.health.recheck();
  }

  /**
   * The anonymous user picked a reachable instance. Move the anonymous identity
   * there, then hard-reload — the same "invalidate everything and rebuild under
   * the new context" path the shell uses for account switches. The probe already
   * confirmed the server responds, so the reloaded app comes up on a live
   * instance and the whale is gone.
   */
  onServerPicked(baseUrl: string): void {
    this.auth.enterAnonymous(baseUrl);
    this.reload();
  }

  /** Seam so tests can assert the reload without navigating the test runner. */
  protected reload(): void {
    location.reload();
  }
}
