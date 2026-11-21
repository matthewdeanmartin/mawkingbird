import { NATIVE_SOCIAL } from '../../../platform/session/platform-login';
import { MbButton } from '../../../design-system/button/button';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Auth } from '../../../platform/session/auth';
import { loginDestination, stashLoginNext } from '../../../platform/session/login-destination';
import { BlueskySession } from '../../../connections/bluesky/bluesky-session';
import { environment } from '../../../../environments/environment';
import { redirectToSecureLogin } from '../../../platform/session/secure-login';

const BLUESKY_ENTRYWAY = 'https://bsky.social';

/**
 * Sign in with Bluesky, as the app's **primary identity**.
 *
 * Distinct from Settings → Connections → Bluesky, which links Bluesky as a
 * *connector* under an existing Mastodon or Anonymous account. Here Bluesky *is* who you are,
 * and the app has no Mastodon account at all until Sprint 4 attaches one.
 *
 * OAuth only: app passwords were retired (spec/bsky_parity.md).
 */
// i18n pages.loginBluesky.title: Sign in with Bluesky
// i18n pages.loginBluesky.intro: Your Bluesky timeline becomes your home timeline in {{brand}}. You can reply, like and repost from here.
// i18n pages.loginBluesky.openingBluesky: Opening Bluesky…
// i18n pages.loginBluesky.continueWithBluesky: Continue with Bluesky
// i18n pages.loginBluesky.createAccount: Create a Bluesky account
// i18n pages.loginBluesky.createNote: New to Bluesky? Bluesky shows its sign-up form, then brings you back here signed in to set up.
// i18n pages.loginBluesky.oauthNote: Sign in on bsky.social with your email address or username, then approve access. Use your account password there; Bluesky does not allow app passwords during OAuth. {{brand}} never sees your password.
// i18n pages.loginBluesky.advancedSummary: Use a specific handle, DID, or another PDS
// i18n pages.loginBluesky.handleLabel: Handle, DID, or PDS
// i18n pages.loginBluesky.handlePlaceholder: you.bsky.social
// i18n pages.loginBluesky.openingProvider: Opening provider…
// i18n pages.loginBluesky.continueWithAccount: Continue with this account
// i18n pages.loginBluesky.useDifferentNetwork: Use a different network
// i18n pages.loginBluesky.lookAround: Look around without an account
// i18n pages.loginBluesky.errors.handleUnresolved: That Bluesky handle could not be resolved. Check the spelling or enter your PDS URL.
// i18n pages.loginBluesky.errors.unreachableProvider: Could not reach your Bluesky provider. Check your connection and try again.
// i18n pages.loginBluesky.errors.oauthStartFailed: Bluesky sign-in could not start. Please try again.
@Component({
  selector: 'app-login-bluesky',
  imports: [MbButton, FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './login-bluesky.html',
  styleUrl: './login-bluesky.css',
})
export class LoginBluesky implements OnInit {
  private auth = inject(Auth);
  private bsky = inject(BlueskySession);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private transloco = inject(TranslocoService);
  private adding = false;
  /** Home, or the allowlisted mini-app that sent the visitor here (`?next=`). */
  private destination = '/home';

  protected brand = environment.brand;
  protected native = inject(NATIVE_SOCIAL);

  protected handle = signal('');
  protected working = signal(false);
  protected error = signal<string | null>(null);

  ngOnInit(): void {
    if (redirectToSecureLogin()) return;
    this.adding = this.route.snapshot.queryParamMap.has('add');
    this.destination = loginDestination(this.route.snapshot.queryParamMap.get('next'));
    // Already signed in and not explicitly adding an account: nothing to do here.
    if (this.auth.isAuthenticated && !this.adding) {
      void this.router.navigateByUrl(this.destination, { replaceUrl: true });
      return;
    }
    // From /create-bluesky-account/: the visitor already chose to sign up.
    if (this.route.snapshot.queryParamMap.get('create') === '1' && !this.native) {
      this.createAccount();
    }
  }

  /** Sign up on bsky.social (`prompt=create`) and come back signed in, into setup. */
  createAccount(): void {
    if (this.working() || this.native) return;
    this.working.set(true);
    this.error.set(null);
    void this.bsky.beginOAuthSignup(this.adding).catch((err: unknown) => {
      this.working.set(false);
      this.error.set(this.describeOAuth(err));
    });
  }

  /** Let Bluesky choose the account and accept its native email/username sign-in. */
  submitBluesky(): void {
    this.beginOAuth(BLUESKY_ENTRYWAY);
  }

  /** Start OAuth for a specific ATProto handle, DID, or PDS. */
  submit(): void {
    const identifier = this.handle().trim().replace(/^@/, '');
    if (!identifier || this.working()) {
      return;
    }
    this.beginOAuth(identifier);
  }

  private beginOAuth(identifier: string): void {
    if (this.working()) {
      return;
    }
    this.working.set(true);
    this.error.set(null);
    // The callback is a fresh page load; it finds the destination here.
    stashLoginNext(this.destination);
    void this.bsky
      .beginOAuthIdentity(identifier, this.adding)
      .then(() => {
        if (!this.native) return;
        if (!this.auth.enterBluesky()) throw new Error('Native identity could not be restored.');
        location.assign(this.destination.replace(/^\//, ''));
      })
      .catch((err: unknown) => {
        // The redirect promise normally never resolves; rejection means discovery
        // or PAR failed, or the visitor came back with browser history.
        this.working.set(false);
        this.error.set(this.describeOAuth(err));
      });
  }

  private describeOAuth(err: unknown): string {
    if (this.native && err && typeof err === 'object' && 'message' in err)
      return String(err.message);
    const message = err instanceof Error ? err.message : '';
    if (/resolve|handle|did/i.test(message)) {
      return this.transloco.translate<string>('pages.loginBluesky.errors.handleUnresolved');
    }
    if (/network|fetch|failed/i.test(message)) {
      return this.transloco.translate<string>('pages.loginBluesky.errors.unreachableProvider');
    }
    return this.transloco.translate<string>('pages.loginBluesky.errors.oauthStartFailed');
  }
}
