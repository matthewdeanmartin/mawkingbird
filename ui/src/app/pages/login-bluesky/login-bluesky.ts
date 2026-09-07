import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Auth } from '../../auth';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { environment } from '../../../environments/environment';

const BLUESKY_ENTRYWAY = 'https://bsky.social';

/**
 * Sign in with Bluesky, as the app's **primary identity**.
 *
 * Distinct from Settings → Connections → Bluesky, which links Bluesky as a
 * *connector* under an existing Mastodon or Anonymous account. Here Bluesky *is* who you are,
 * and the app has no Mastodon account at all until Sprint 4 attaches one.
 */
// i18n pages.loginBluesky.title: Sign in with Bluesky
// i18n pages.loginBluesky.intro: Your Bluesky timeline becomes your home timeline in {{brand}}. You can reply, like and repost from here.
// i18n pages.loginBluesky.openingBluesky: Opening Bluesky…
// i18n pages.loginBluesky.continueWithBluesky: Continue with Bluesky
// i18n pages.loginBluesky.oauthNote: Sign in on bsky.social with your email address or username, then approve access. Use your account password there; Bluesky does not allow app passwords during OAuth. {{brand}} never sees your password.
// i18n pages.loginBluesky.advancedSummary: Use a specific handle, DID, or another PDS
// i18n pages.loginBluesky.handleLabel: Handle, DID, or PDS
// i18n pages.loginBluesky.handlePlaceholder: you.bsky.social
// i18n pages.loginBluesky.openingProvider: Opening provider…
// i18n pages.loginBluesky.continueWithAccount: Continue with this account
// i18n pages.loginBluesky.selfHostedHint: If you host your own PDS rather than using Bluesky's, signing in that way isn't supported yet — this form authenticates against bsky.social.
// i18n pages.loginBluesky.compatSummary: My PDS does not support OAuth yet
// i18n pages.loginBluesky.appPasswordIntro: Use an <strong>app password</strong>, never your real Bluesky password. Make one at
// i18n pages.loginBluesky.appPasswordLinkText: bsky.app → Settings → Privacy and security → App Passwords
// i18n pages.loginBluesky.dmTickHint: Tick <em>“Allow access to your direct messages”</em> if you want Bluesky DMs in Chat.
// i18n pages.loginBluesky.appPasswordLabel: App password
// i18n pages.loginBluesky.appPasswordPlaceholder: xxxx-xxxx-xxxx-xxxx
// i18n pages.loginBluesky.signingIn: Signing in…
// i18n pages.loginBluesky.useAppPassword: Use app password
// i18n pages.loginBluesky.useDifferentNetwork: Use a different network
// i18n pages.loginBluesky.lookAround: Look around without an account
// i18n pages.loginBluesky.errors.storageBlocked: Signed in, but this browser could not store the session. Check whether storage is blocked for this site.
// i18n pages.loginBluesky.errors.handleUnresolved: That Bluesky handle could not be resolved. Check the spelling or enter your PDS URL.
// i18n pages.loginBluesky.errors.unreachableProvider: Could not reach your Bluesky provider. Check your connection and try again.
// i18n pages.loginBluesky.errors.oauthStartFailed: Bluesky sign-in could not start. Please try again.
// i18n pages.loginBluesky.errors.rateLimited: Bluesky is rate-limiting sign-in attempts from this browser. Wait a few minutes and try again.
// i18n pages.loginBluesky.errors.credentialsRejected: That handle and app password combination was rejected.
// i18n pages.loginBluesky.errors.unreachable: Could not reach Bluesky. Check your connection — a content blocker or extension may also be blocking the request.
// i18n pages.loginBluesky.errors.signInFailed: Sign-in failed. Please try again.
@Component({
  selector: 'app-login-bluesky',
  imports: [FormsModule, RouterLink, TranslocoPipe],
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

  protected brand = environment.brand;

  protected handle = signal('');
  protected appPassword = signal('');
  protected working = signal(false);
  protected error = signal<string | null>(null);
  /** Set when the failure looks like a self-hosted PDS rather than bad credentials. */
  protected selfHostedHint = signal(false);

  ngOnInit(): void {
    this.adding = this.route.snapshot.queryParamMap.has('add');
    // Already signed in and not explicitly adding an account: nothing to do here.
    if (this.auth.isAuthenticated && !this.adding) {
      void this.router.navigateByUrl('/home', { replaceUrl: true });
    }
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
    void this.bsky.beginOAuthIdentity(identifier, this.adding).catch((err: unknown) => {
      // The redirect promise normally never resolves; rejection means discovery
      // or PAR failed, or the visitor came back with browser history.
      this.working.set(false);
      this.error.set(this.describeOAuth(err));
    });
  }

  /** Legacy compatibility path for PDSes that do not yet implement OAuth. */
  submitAppPassword(): void {
    const identifier = this.handle().trim().replace(/^@/, '');
    const password = this.appPassword();
    if (!identifier || !password || this.working()) {
      return;
    }
    this.working.set(true);
    this.error.set(null);
    this.selfHostedHint.set(false);

    this.bsky.loginAsIdentity(identifier, password).subscribe({
      next: () => {
        // The identity is in storage; this makes it the active account. Order
        // matters: enterBluesky() reads the identity back out of storage and
        // refuses to activate a kind it cannot serve.
        const entered = this.auth.enterBluesky();
        this.working.set(false);
        if (!entered) {
          this.error.set(
            this.transloco.translate<string>('pages.loginBluesky.errors.storageBlocked'),
          );
          return;
        }
        // Clear the password from memory the moment it is no longer needed.
        this.appPassword.set('');
        if (this.adding) {
          // Services chose their account scope when Angular constructed them.
          // A hard navigation rebuilds the app under the newly active DID.
          location.assign('home');
        } else {
          void this.router.navigateByUrl('/home');
        }
      },
      error: (err: unknown) => {
        this.working.set(false);
        this.error.set(this.describe(err, identifier));
      },
    });
  }

  private describeOAuth(err: unknown): string {
    const message = err instanceof Error ? err.message : '';
    if (/resolve|handle|did/i.test(message)) {
      return this.transloco.translate<string>('pages.loginBluesky.errors.handleUnresolved');
    }
    if (/network|fetch|failed/i.test(message)) {
      return this.transloco.translate<string>('pages.loginBluesky.errors.unreachableProvider');
    }
    return this.transloco.translate<string>('pages.loginBluesky.errors.oauthStartFailed');
  }

  /**
   * Turn a failed `createSession` into something actionable.
   *
   * The self-hosted case earns its own message. `BSKY_SERVICE` is fixed at
   * `bsky.social`, which is an *entryway* — it authenticates every account whose
   * PDS Bluesky operates, which is nearly all of them. Someone running their own
   * PDS cannot authenticate there at all, and telling them "wrong handle or app
   * password" would send them to re-check credentials that are perfectly correct.
   * A handle on a non-`bsky.social` domain is not proof of self-hosting (custom
   * domains on Bluesky's own PDS are common and work fine), so this is only
   * offered as a possibility, after the likelier explanation.
   */
  private describe(err: unknown, identifier: string): string {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    const body = err instanceof HttpErrorResponse ? err.error : null;
    const tag = typeof body?.error === 'string' ? body.error : '';

    if (status === 429 || tag === 'RateLimitExceeded') {
      return this.transloco.translate<string>('pages.loginBluesky.errors.rateLimited');
    }
    if (status === 400 || status === 401) {
      if (!identifier.endsWith('.bsky.social') && identifier.includes('.')) {
        this.selfHostedHint.set(true);
      }
      return this.transloco.translate<string>('pages.loginBluesky.errors.credentialsRejected');
    }
    if (status === 0) {
      return this.transloco.translate<string>('pages.loginBluesky.errors.unreachable');
    }
    return this.transloco.translate<string>('pages.loginBluesky.errors.signInFailed');
  }
}
