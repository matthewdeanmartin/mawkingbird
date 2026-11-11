import { MbButton } from '../../../design-system/button/button';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Auth } from '../../../platform/session/auth';
import {
  loginDestination,
  stashLoginNext,
  takeLoginNext,
} from '../../../platform/session/login-destination';
import { MisskeyAuth, MisskeySignInError } from '../../../connections/misskey/misskey-auth';
import { MisskeyApi, MisskeyApiError } from '../../../connections/misskey/misskey-api';
import {
  MISSKEY_VISITOR,
  saveMisskeyVisitor,
} from '../../../connections/misskey/misskey-identity-store';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { redirectToSecureLogin } from '../../../platform/session/secure-login';

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
// i18n pages.loginMisskey.lookAround: Mastodon and Bluesky without an account
// i18n pages.loginMisskey.visitTitle: Look around a Misskey server
// i18n pages.loginMisskey.visit: Look around without an account
// i18n pages.loginMisskey.visitNote: Or just look around: read a server's public notes, profiles and hashtags without an account. Follows stay in this browser.
// i18n pages.loginMisskey.errors.visitorsBlocked: {{server}} does not show its notes to visitors. Sign in there, or look around another server.
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
/** One entry of public/misskey-servers.json. */
export interface MisskeyServerSuggestion {
  host: string;
  name: string;
  language: string | null;
  users: number;
  openRegistrations: boolean;
  iconUrl: string | null;
}

@Component({
  selector: 'app-login-misskey',
  imports: [MbButton, FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './login-misskey.html',
  styleUrl: './login-misskey.css',
})
export class LoginMisskey implements OnInit {
  private auth = inject(Auth);
  private misskey = inject(MisskeyAuth);
  private api = inject(MisskeyApi);
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
  /**
   * Suggested servers for the address field: alive, not suspended, not on
   * JoinMisskey's blocklist, verified to run Misskey itself. Generated by
   * `npm run servers:misskey` from servers.misskey.ink; empty if it fails to load.
   */
  protected suggestions = signal<MisskeyServerSuggestion[]>([]);
  /** Came here to visit a server (from the visitor's Home), not to sign in. */
  protected visiting = signal(false);

  ngOnInit(): void {
    if (redirectToSecureLogin()) return;
    void this.loadSuggestions();
    const params = this.route.snapshot.queryParamMap;
    const session = params.get('session');
    if (session) {
      void this.complete(session);
      return;
    }
    // Someone already signed in who opens this page wants another Misskey
    // account or the visitor: it is always "adding", never a bounce back home.
    // (Bouncing them home sent the owner straight back to their account when
    // they came to look around misskey.io, 2026-11-10.)
    this.adding = params.has('add') || this.auth.isAuthenticated;
    this.visiting.set(params.has('visit'));
    // Sent here from the Mastodon door with the server already typed.
    const server = params.get('server');
    if (server) this.server.set(server);
    this.destination = loginDestination(params.get('next'));
  }

  private async loadSuggestions(): Promise<void> {
    try {
      const response = await fetch(new URL('misskey-servers.json', document.baseURI));
      if (!response.ok) return;
      const servers = (await response.json()) as MisskeyServerSuggestion[];
      if (Array.isArray(servers))
        this.suggestions.set(servers.filter((s) => typeof s?.host === 'string'));
    } catch {
      // Suggestions are a convenience; typing an address still works.
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

  /**
   * Become (or move) the Misskey visitor: the account-less Misskey user,
   * reading this server's public notes without a token. A server that hides
   * everything from visitors is turned down here rather than showing an
   * empty Home.
   */
  async visit(): Promise<void> {
    const input = this.server().trim();
    if (!input || this.working()) return;
    this.working.set(true);
    this.error.set(null);
    try {
      const origin = await this.misskey.checkServer(input);
      const meta = await firstValueFrom(this.api.meta(origin));
      if (meta.ugcVisibilityForVisitor === 'none') {
        this.working.set(false);
        this.error.set(
          this.transloco.translate<string>('pages.loginMisskey.errors.visitorsBlocked', {
            server: new URL(origin).host,
          }),
        );
        return;
      }
      saveMisskeyVisitor(origin);
      if (!this.auth.enterMisskey(MISSKEY_VISITOR)) {
        this.fail(this.transloco.translate<string>('pages.loginMisskey.errors.storageBlocked'));
        return;
      }
      // A hard navigation, as when adding an account: services chose their
      // account scope and server when Angular built them.
      location.assign(this.destination.replace(/^\//, ''));
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
