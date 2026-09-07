import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../auth';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';

// i18n blueskyOauth.errorTitle: Bluesky sign-in did not finish
// i18n blueskyOauth.back: Back to Bluesky sign-in
// i18n blueskyOauth.finishing: Finishing Bluesky sign-in…
// i18n blueskyOauth.exchange: Your PDS is exchanging the one-time authorization code.

/** Completes the SDK-owned OAuth code exchange before Angular enters the app. */
@Component({
  selector: 'app-bluesky-oauth-callback',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './bluesky-oauth-callback.html',
  styleUrl: './bluesky-oauth-callback.css',
})
export class BlueskyOAuthCallback implements OnInit {
  private auth = inject(Auth);
  private bsky = inject(BlueskySession);
  private router = inject(Router);

  protected error = signal<string | null>(null);

  ngOnInit(): void {
    void this.finish();
  }

  private async finish(): Promise<void> {
    try {
      const result = await this.bsky.finishOAuthIdentity();
      if (!this.auth.enterBluesky()) {
        throw new Error('The browser could not store the Bluesky identity.');
      }
      if (result.adding) {
        // Recreate account-scoped singletons under the newly active DID.
        location.assign('home');
      } else {
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      }
    } catch (err: unknown) {
      this.error.set(describeOAuthError(err));
    }
  }
}

function describeOAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (/denied|cancel|access_denied/i.test(message)) {
    return 'Bluesky sign-in was cancelled. Nothing was added to this browser.';
  }
  if (/IndexedDB|storage|store/i.test(message)) {
    return 'This browser could not save the Bluesky session. Check whether site storage is blocked.';
  }
  return 'Bluesky could not finish signing in. Please return to sign-in and try again.';
}
