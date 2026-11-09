import { MbButton } from '../../design-system/button/button';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Auth } from '../../auth';
import { loginDestination, stashLoginNext, takeLoginNext } from '../../login-destination';
import { MisskeyAuth, MisskeySignInError } from '../../providers/misskey/misskey-auth';
import { MisskeyApiError } from '../../providers/misskey/misskey-api';
import { environment } from '../../../environments/environment';
import { redirectToSecureLogin } from '../../secure-login';

// i18n pages.loginMisskey.title: Sign in with Misskey
// i18n pages.loginMisskey.intro: Your Misskey timelines become your home timeline in {{brand}}. Reading only for now; posting and reactions are coming.
// i18n pages.loginMisskey.serverLabel: Your Misskey server
// i18n pages.loginMisskey.serverPlaceholder: misskey.io
// i18n pages.loginMisskey.serverHint: The address you sign in to Misskey at, such as misskey.io. You can also paste your handle, like @you@misskey.io.
// i18n pages.loginMisskey.continue: Continue on Misskey
// i18n pages.loginMisskey.checking: Checking server…
// i18n pages.loginMisskey.completing: Finishing sign-in…
// i18n pages.loginMisskey.note: Misskey will ask you to approve read access for {{brand}}. {{brand}} never sees your password.
// i18n pages.loginMisskey.useDifferentNetwork: Use a different network
// i18n pages.loginMisskey.lookAround: Look around without an account
// i18n pages.loginMisskey.errors.invalidAddress: That does not look like a server address. Try something like misskey.io.
// i18n pages.loginMisskey.errors.unreachable: Could not reach that server, or it did not say what software it runs. Check the address and your connection.
// i18n pages.loginMisskey.errors.mastodon: That server runs {{software}}, not Misskey. Sign in with the Mastodon option instead.
// i18n pages.loginMisskey.errors.fork: That server runs {{software}}, which is based on Misskey. Only Misskey itself is supported for now.
// i18n pages.loginMisskey.errors.notMisskey: That server runs {{software}}, not Misskey.
// i18n pages.loginMisskey.errors.sessionMissing: This sign-in was started in another tab or has expired. Please start again.
// i18n pages.loginMisskey.errors.sessionRejected: Misskey did not confirm the sign-in. If you pressed Deny, that is expected; otherwise, please try again.
// i18n pages.loginMisskey.errors.storageBlocked: Signed in, but this browser could not store the session. Check whether storage is blocked for this site.
// i18n pages.loginMisskey.errors.failed: Sign-in failed. Please try again.

/**
 * Sign in with Misskey, as the app's **primary identity**, through MiAuth.
 *
 * One page for both halves of the round trip: the form sends the reader to
 * their server to approve, and the server sends them back here with
 * `?session=`, which this page exchanges for a token. Not to be confused with
 * a connector: there is no Misskey connector under other accounts yet.
 */
@Component({
  selector: 'app-login-misskey',
  imports: [MbButton, FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './login-misskey.html',
  styleUrl: './login-misskey.css',
})
export class LoginMisskey implements OnInit {
  private auth = inject(Auth);
  private misskey = inject(MisskeyAuth);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private transloco = inject(TranslocoService);
  private adding = false;
  private destination = '/home';

  protected brand = environment.brand;
  protected server = signal('');
  protected working = signal(false);
  /** True while exchanging `?session=` for a token on the way back. */
  protected completing = signal(false);
  protected error = signal<string | null>(null);

  ngOnInit(): void {
    if (redirectToSecureLogin()) return;
    const params = this.route.snapshot.queryParamMap;
    const session = params.get('session');
    if (session) {
      void this.complete(session);
      return;
    }
    this.adding = params.has('add');
    this.destination = loginDestination(params.get('next'));
    if (this.auth.isAuthenticated && !this.adding) {
      void this.router.navigateByUrl(this.destination, { replaceUrl: true });
    }
  }

  async submit(): Promise<void> {
    const input = this.server().trim();
    if (!input || this.working()) return;
    this.working.set(true);
    this.error.set(null);
    try {
      const origin = await this.misskey.checkServer(input);
      stashLoginNext(this.destination);
      location.assign(this.misskey.begin(origin, this.adding));
    } catch (err) {
      this.working.set(false);
      this.error.set(this.describe(err));
    }
  }

  private async complete(session: string): Promise<void> {
    this.completing.set(true);
    try {
      const { key, adding } = await this.misskey.complete(session);
      if (!this.auth.enterMisskey(key)) {
        this.fail(this.transloco.translate<string>('pages.loginMisskey.errors.storageBlocked'));
        return;
      }
      const destination = takeLoginNext();
      if (adding) {
        // Services chose their account scope when Angular built them; a hard
        // navigation rebuilds the app under the new identity, as Bluesky does.
        location.assign(destination.replace(/^\//, ''));
      } else {
        void this.router.navigateByUrl(destination, { replaceUrl: true });
      }
    } catch (err) {
      this.fail(this.describe(err));
    }
  }

  private fail(message: string): void {
    this.completing.set(false);
    this.error.set(message);
    // Drop `?session=` so a reload does not retry a spent session.
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  private describe(err: unknown): string {
    const t = (key: string, params?: Record<string, string>) =>
      this.transloco.translate<string>(`pages.loginMisskey.errors.${key}`, params);
    if (err instanceof MisskeySignInError) {
      const software = err.software ?? '?';
      switch (err.problem) {
        case 'invalid-address':
          return t('invalidAddress');
        case 'unreachable':
          return t('unreachable');
        case 'mastodon':
          return t('mastodon', { software });
        case 'fork':
          return t('fork', { software });
        case 'not-misskey':
          return t('notMisskey', { software });
        case 'session-missing':
          return t('sessionMissing');
        case 'session-rejected':
          return t('sessionRejected');
      }
    }
    if (err instanceof MisskeyApiError && err.status === 0) {
      return t('unreachable');
    }
    return t('failed');
  }
}
