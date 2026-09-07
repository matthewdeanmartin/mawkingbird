import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DropboxEntry, DropboxSession } from '../../../../providers/dropbox/dropbox-session';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { PageDiagnostics } from '../../../../page-diagnostics';

// i18n settings.connections.dropbox.title: 📦 Dropbox
// i18n settings.connections.dropbox.intro: Connect an app-specific Dropbox folder with OAuth. Authorization and file access happen directly between this browser and Dropbox; Mawkingbird never receives a client secret or your files.
// i18n settings.connections.dropbox.notConfigured: Dropbox is not configured for this build. Add the public Dropbox app key to the Angular environment first.
// i18n settings.connections.dropbox.listing: Listing…
// i18n settings.connections.dropbox.list: List files and folders
// i18n settings.connections.dropbox.disconnect: Disconnect
// i18n settings.connections.dropbox.sessionOnly: This short-lived connection is kept only for this browser session. Reconnect after it expires.
// i18n settings.connections.dropbox.connect: Connect Dropbox
// i18n settings.connections.dropbox.modalTitle: Dropbox files and folders
// i18n settings.connections.dropbox.closeAriaLabel: Close
// i18n settings.connections.dropbox.empty: This Dropbox folder is empty.
// i18n settings.connections.dropbox.close: Close
// i18n settings.connections.dropbox.connected: Dropbox connected.
// i18n settings.connections.dropbox.authFailed: Dropbox authorization failed.
// i18n settings.connections.dropbox.startFailed: Couldn't start Dropbox authorization.
// i18n settings.connections.dropbox.listFailed: Couldn't list your Dropbox files.
/**
 * Settings → Connections → Dropbox. The OAuth round trip lands back here (see
 * `pages/dropbox-callback`), so this page also reads the `?dropbox=` result.
 */
@Component({
  selector: 'app-connection-dropbox',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './connection-dropbox.html',
  styleUrls: ['../connection-page.css', './connection-dropbox.css'],
})
export class ConnectionDropbox implements OnInit {
  protected dropbox = inject(DropboxSession);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);

  protected dropboxBusy = signal(false);
  protected dropboxError = signal<string | null>(null);
  protected dropboxNotice = signal<string | null>(null);
  protected dropboxEntries = signal<DropboxEntry[] | null>(null);

  /** The storage-scope sentence shown under the heading. */
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.session.detail;

  ngOnInit(): void {
    const result = this.route.snapshot.queryParamMap.get('dropbox');
    if (result === 'connected') {
      this.dropboxNotice.set(
        this.transloco.translate<string>('settings.connections.dropbox.connected'),
      );
    } else if (result === 'error') {
      this.dropboxError.set(
        this.route.snapshot.queryParamMap.get('message') ??
          this.transloco.translate<string>('settings.connections.dropbox.authFailed'),
      );
    }
    if (result) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  async connectDropbox(): Promise<void> {
    this.dropboxError.set(null);
    this.dropboxNotice.set(null);
    try {
      await this.dropbox.connect();
    } catch (error: unknown) {
      this.diagnostics.error('Dropbox', 'connect:error', error);
      this.dropboxError.set(
        describeError(
          error,
          this.transloco.translate<string>('settings.connections.dropbox.startFailed'),
        ),
      );
    }
  }

  async listDropbox(): Promise<void> {
    if (this.dropboxBusy()) {
      return;
    }
    this.dropboxBusy.set(true);
    this.dropboxError.set(null);
    try {
      this.dropboxEntries.set(await this.dropbox.listRoot());
    } catch (error: unknown) {
      this.diagnostics.error('Dropbox', 'list-root:error', error);
      this.dropboxError.set(
        describeError(
          error,
          this.transloco.translate<string>('settings.connections.dropbox.listFailed'),
        ),
      );
    } finally {
      this.dropboxBusy.set(false);
    }
  }

  disconnectDropbox(): void {
    this.dropbox.disconnect();
    this.dropboxEntries.set(null);
    this.dropboxNotice.set(null);
  }
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
