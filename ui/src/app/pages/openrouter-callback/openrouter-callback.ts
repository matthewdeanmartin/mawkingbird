import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { OpenRouterSession } from '../../providers/openrouter/openrouter-session';
import { PageDiagnostics } from '../../page-diagnostics';

/**
 * Completes OpenRouter's browser-only PKCE callback before returning to the
 * connection page.
 *
 * The query string carries OpenRouter's `code` plus the `state` the session
 * smuggled through `callback_url` — see {@link OpenRouterSession} for why the
 * state has to travel that way.
 */
@Component({
  selector: 'app-openrouter-callback',
  template: `
    <main class="callback-card" aria-live="polite">
      <h1>Connecting OpenRouter…</h1>
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
export class OpenRouterCallback implements OnInit {
  private openrouter = inject(OpenRouterSession);
  private router = inject(Router);
  private diagnostics = inject(PageDiagnostics);
  protected status = signal('Finishing authorization with OpenRouter.');

  async ngOnInit(): Promise<void> {
    try {
      await this.openrouter.finishAuthorization(new URLSearchParams(location.search));
      await this.router.navigate(['/settings/connections/openrouter'], {
        queryParams: { openrouter: 'connected' },
      });
    } catch (error: unknown) {
      this.diagnostics.error('OpenRouter', 'authorization:error', error);
      const message = error instanceof Error ? error.message : 'OpenRouter authorization failed.';
      await this.router.navigate(['/settings/connections/openrouter'], {
        queryParams: { openrouter: 'error', message },
      });
    }
  }
}
