import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DropboxSession } from '../../providers/dropbox/dropbox-session';
import { PageDiagnostics } from '../../page-diagnostics';

/** Completes Dropbox's browser-only PKCE callback before returning to Connections. */
@Component({
  selector: 'app-dropbox-callback',
  template: `
    <main class="callback-card" aria-live="polite">
      <h1>Connecting Dropbox…</h1>
      <p>{{ status() }}</p>
    </main>
  `,
  styles: `
    :host {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .callback-card {
      max-width: 480px;
      text-align: center;
    }
  `,
})
export class DropboxCallback implements OnInit {
  private dropbox = inject(DropboxSession);
  private router = inject(Router);
  private diagnostics = inject(PageDiagnostics);
  protected status = signal('Finishing authorization with Dropbox.');

  async ngOnInit(): Promise<void> {
    try {
      await this.dropbox.finishAuthorization(new URLSearchParams(location.search));
      await this.router.navigate(['/settings/connections/dropbox'], {
        queryParams: { dropbox: 'connected' },
      });
    } catch (error: unknown) {
      this.diagnostics.error('Dropbox', 'authorization:error', error);
      const message = error instanceof Error ? error.message : 'Dropbox authorization failed.';
      await this.router.navigate(['/settings/connections/dropbox'], {
        queryParams: { dropbox: 'error', message },
      });
    }
  }
}
