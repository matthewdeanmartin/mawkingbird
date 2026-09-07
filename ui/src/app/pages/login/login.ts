import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Api } from '../../api';
import { MockApi } from '../../mock-api';
import { Auth } from '../../auth';
import { Account, DevUser } from '../../models';
import { Server, SERVER_PRESETS } from '../../server';
import { MastodonServers, ServerSuggestion } from '../../mastodon-servers';
import { normalizeHostUrl } from '../../host-url';
import { ClientPrefs } from '../../client-prefs';
import { codeChallengeFor, createCodeVerifier, createOAuthState, statesMatch } from '../../pkce';
import { probeServerAvailability } from '../../server-availability';
import { environment } from '../../../environments/environment';
import { brandLogoSrc } from '../../build-flavor';
import { AppFooter } from '../../shell/app-footer/app-footer';
import { ServerDiscovery } from '../../server-discovery/server-discovery';

const OAUTH_APP_KEY = 'mastodon_mock_oauth_app';

/**
 * The in-flight OAuth attempt, held in sessionStorage between the redirect out
 * to the instance and the callback here.
 *
 * `state` and `codeVerifier` are what make this flow safe for a client that
 * cannot keep a secret: `state` proves the callback belongs to the flow this
 * browser started (without it, an attacker can hand us a code minted for their
 * own account and silently sign the user into it), and `codeVerifier` is the
 * PKCE secret that binds the code to this browser. Both are single-use — the
 * whole record is cleared once the callback is handled, success or failure.
 */
interface StoredApp {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  /** Instance the flow was started against; the code is only valid there. */
  server: string;
}

type Tab = 'signin' | 'mock' | 'init';

/**
 * Why the visitor came to the sign-in page.
 *
 * Not the same question as `LoginChooser`'s, which is "which network" and has
 * already been answered before this page loads. See {@link Login.intent}.
 */
type LoginIntent = 'have' | 'need' | 'look';

/** How much authority to request from the instance during OAuth. */
export type OAuthAccess = 'full' | 'read';

/**
 * OAuth scope strings per access level. `read write follow` is what a Mastodon
 * client normally needs; `read` alone yields a token the instance will reject
 * for every write endpoint, which is exactly the point.
 */
const ACCESS_SCOPES: Record<OAuthAccess, string> = {
  full: 'read write follow',
  read: 'read',
};

// i18n pages.login.seedFailed: Seeding failed.
// i18n pages.login.access.full.label: Full access
// i18n pages.login.access.full.hint: Read, post, reply, follow — everything the app does.
// i18n pages.login.access.read.label: Read only
// i18n pages.login.access.read.hint: Browse and read. This app won't be able to post, reply or follow as you.
const ACCESS_CHOICES: { value: OAuthAccess; labelKey: string; hintKey: string }[] = [
  {
    value: 'full',
    labelKey: 'pages.login.access.full.label',
    hintKey: 'pages.login.access.full.hint',
  },
  {
    value: 'read',
    labelKey: 'pages.login.access.read.label',
    hintKey: 'pages.login.access.read.hint',
  },
];

/**
 * Something that could plausibly be an instance host (with or without scheme): a dotted
 * domain, or a local dev target (localhost / *.localhost / bare IP), each optionally :port.
 */
const DOMAIN_RE =
  /^(https?:\/\/)?(([a-z0-9-]+\.)+[a-z]{2,}|localhost|([a-z0-9-]+\.)*localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?$/i;

/** How the current server-combo text relates to a reachable instance. */
type ServerStatus = 'idle' | 'checking' | 'ok' | 'degraded' | 'unreachable';

// i18n pages.login.tagline: An opinionated client for Mastodon and the Fediverse.
// i18n pages.login.tabs.signin: Sign in / Register
// i18n pages.login.tabs.mockLogin: Mock Login
// i18n pages.login.tabs.mockInit: Mock Init
// i18n pages.login.notSure.question: Not sure which server?
// i18n pages.login.notSure.browse: Browse the full directory on joinmastodon.org ↗
// i18n pages.login.server.label: Your server
// i18n pages.login.server.placeholder: mastodon.social — or type any instance
// i18n pages.login.server.thisServerMock: This server (mock)
// i18n pages.login.server.checking: Checking {{server}}…
// i18n pages.login.server.connected: ✓ Connected to <strong>{{server}}</strong>
// i18n pages.login.server.degraded: ⚠ Connected to <strong>{{server}}</strong>, but {{media}} is blocked or down. Images will not load.
// i18n pages.login.server.itsMediaServer: its media server
// i18n pages.login.server.useAnyway: Use anyway
// i18n pages.login.server.unreachable: ⚠ Can’t reach {{server}}. The server may be offline or blocked.
// i18n pages.login.server.tryAgain: Try again
// i18n pages.login.server.talkingTo: Talking to
// i18n pages.login.server.thisServer: this server
// i18n pages.login.server.pickAServer: — pick a server —
// i18n pages.login.intent.question: What brings you here?
// i18n pages.login.intent.have: I have a Mastodon account
// i18n pages.login.intent.haveHint: Sign in on the server where your account lives.
// i18n pages.login.intent.need: I need an account
// i18n pages.login.intent.needHint: Pick a server and sign up there. It takes a couple of minutes.
// i18n pages.login.intent.look: I'm just looking
// i18n pages.login.intent.lookHint: Read without an account. You can sign in whenever you like.
// i18n pages.login.intent.change: ← Something else
// i18n pages.login.path.haveAccount: I have an account
// i18n pages.login.path.pickServerFirst: Pick your server above, then sign in.
// i18n pages.login.oauth.accessLegend: How much access to grant this app
// i18n pages.login.oauth.redirecting: Redirecting…
// i18n pages.login.oauth.signInWith: Sign in with {{server}}
// i18n pages.login.oauth.ownPage: You'll log in on {{server}}'s own page and come straight back.
// i18n pages.login.oauth.neverSeePassword: We never see your password.
// i18n pages.login.token.summary: I have an API token
// i18n pages.login.token.paste: For developers and power users: paste an access token for {{server}} (create one under Preferences → Development on your server).
// i18n pages.login.token.placeholder: access token
// i18n pages.login.token.checking: Checking…
// i18n pages.login.token.submit: Sign in with token
// i18n pages.login.path.newHere: I'm new here
// i18n pages.login.confirm.sentTo: Almost there! We sent a confirmation email to
// i18n pages.login.confirm.clickLink: . Click the link to verify your address.
// i18n pages.login.confirm.verifying: Verifying…
// i18n pages.login.confirm.verify: ✉ Verify email & continue
// i18n pages.login.confirm.mockNote.a: (This mock doesn't really send mail — clicking just exercises
// i18n pages.login.confirm.mockNote.b: and signs you in.)
// i18n pages.login.register.usernamePlaceholder: username
// i18n pages.login.register.emailPlaceholder: email
// i18n pages.login.register.passwordPlaceholder: password
// i18n pages.login.register.agree: I agree to the server rules
// i18n pages.login.register.creating: Creating…
// i18n pages.login.register.submit: Sign up on the mock
// i18n pages.login.signup.createOn: Create an account on {{server}} →
// i18n pages.login.anon.heading: Browse anonymously
// i18n pages.login.anon.continue: Continue anonymously
// i18n pages.login.anon.tryIt: Try it without an account, using {{server}} for public data.
// i18n pages.login.anon.findOne: Or let us find a working public server:
// i18n pages.login.anon.findAWorkingServer: Find a working server
// i18n pages.login.mock.intro: One-click sign-in as any local account — Twitter-style. Switch between them anytime from the avatar menu in the header.
// i18n pages.login.mock.addRegular: + Regular user
// i18n pages.login.mock.addAdmin: + Admin user
// i18n pages.login.mock.refresh: refresh
// i18n pages.login.mock.loginAs: Log in as @{{username}}
// i18n pages.login.mock.adminBadge: admin
// i18n pages.login.mock.empty: No accounts yet — generate one above or seed sample data.
// i18n pages.login.seed.intro: Bulk-generate a throwaway cohort of accounts, statuses and relationships.
// i18n pages.login.seed.preset.tiny: tiny (~100 posts)
// i18n pages.login.seed.preset.small: small (~5k posts)
// i18n pages.login.seed.preset.medium: medium (~100k posts)
// i18n pages.login.seed.seeding: Seeding…
// i18n pages.login.seed.submit: Seed sample data
// i18n pages.login.seed.hint.a: After seeding, head to
// i18n pages.login.seed.hint.b: to sign in as one of the new accounts.
// i18n pages.login.privacy.checkbox: Count my page views
// i18n pages.login.privacy.explain: Anonymous page counts only — which kinds of page get used, never which account, post or tag you looked at. Unchecking this means the analytics script is never loaded: nothing is fetched, counted or sent. You can change it later in Settings.
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, AppFooter, ServerDiscovery, TranslocoPipe],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit, OnDestroy {
  private api = inject(Api);
  private readonly transloco = inject(TranslocoService);
  private mockApi = inject(MockApi);
  private auth = inject(Auth);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected server = inject(Server);
  private mastodonServers = inject(MastodonServers);

  protected tab = signal<Tab>('signin');

  /**
   * Which of the three doors the visitor picked, or null while being asked.
   *
   * ## Why this page asks a second question
   *
   * `/login` (`LoginChooser`) already asked "Mastodon or Bluesky", so by the
   * time this component loads the *network* is settled. What arrived here
   * unsettled was everything else: the page used to render the server picker,
   * "I have an account", "I'm new here" and "Continue anonymously" all at once,
   * in three bordered panels that stack into one column on a phone.
   *
   * Two of those three are mutually exclusive by construction — nobody needs
   * both the sign-in form and the registration path — so showing both is pure
   * noise for whichever visitor is reading. Worse is the order: the server
   * combobox is the *first* control on the page, and picking a Mastodon server
   * is a question only someone who already has an account can answer. A
   * stranger met a configuration field before they were offered a way in.
   *
   * So the parts are gated behind the one question that tells them apart. It is
   * null until answered, which is what keeps the machinery off the first screen.
   */
  protected intent = signal<LoginIntent | null>(null);

  /** The three doors, in the order they are offered. */
  protected readonly intentChoices: readonly {
    value: LoginIntent;
    labelKey: string;
    hintKey: string;
    emoji: string;
  }[] = [
    {
      value: 'have',
      labelKey: 'pages.login.intent.have',
      hintKey: 'pages.login.intent.haveHint',
      emoji: '🔑',
    },
    {
      value: 'need',
      labelKey: 'pages.login.intent.need',
      hintKey: 'pages.login.intent.needHint',
      emoji: '✨',
    },
    {
      value: 'look',
      labelKey: 'pages.login.intent.look',
      hintKey: 'pages.login.intent.lookHint',
      emoji: '👀',
    },
  ];

  /** Build flavor: brand text and whether mock-only login tabs are shown. */
  protected brand = environment.brand;
  protected mockTooling = environment.mockTooling;
  /**
   * Canary deployments (/canary/ base href) show a distinct brand mark, and the
   * reader's illustration set picks which drawing of it. A computed so the
   * toggle applies live — and so `prefs` need not be declared above this line.
   */
  protected logoSrc = computed(() => brandLogoSrc(this.prefs.artStyle()));

  protected serverPresets = SERVER_PRESETS;
  protected customServer = signal('');
  /** Curated instances matching the combo text; drives the suggestion dropdown. */
  protected serverSuggestions = signal<ServerSuggestion[]>([]);
  /** Whether the suggestion dropdown is open (focused + has results). */
  protected suggestOpen = signal(false);
  /** Reachability of what's typed in the server combo (drives the ✓/⚠ hint). */
  protected serverStatus = signal<ServerStatus>('idle');
  /** The reached instance's self-reported title ("Mastodon", …). */
  protected serverTitle = signal<string | null>(null);
  /** Host serving representative media, shown when that request is blocked. */
  protected mediaHost = signal<string | null>(null);
  /** Degraded servers are not selected until the user explicitly accepts one. */
  protected pendingDegradedServer = signal<string | null>(null);
  private serverDebounce: ReturnType<typeof setTimeout> | null = null;
  /** Guards against a slow instance probe overwriting a newer one. */
  private probeSeq = 0;

  /**
   * Mocking Bird has no "this server"; until the user picks an instance, every API call
   * would hit the static host. Gate the sign-in forms on a chosen instance.
   */
  protected needsInstance = computed(() => !this.server.allowsThisServer && !this.server.baseUrl());

  /** Short host name for buttons/copy: "mastodon.social" instead of the full URL. */
  protected serverHostLabel = computed(() => {
    const base = this.server.baseUrl();
    return base ? base.replace(/^https?:\/\//, '') : 'this server';
  });

  /** Anonymous always targets a real instance, even in the embedded mock build. */
  protected anonymousServerHostLabel = computed(() =>
    this.server.baseUrl() ? this.serverHostLabel() : 'mastodon.social',
  );

  // --- Sign in (token) ---
  protected token = signal('');
  protected error = signal<string | null>(null);
  protected checking = signal(false);

  // --- Register (mock server only: never proxy a real server's credentials) ---
  protected regUsername = signal('');
  protected regEmail = signal('');
  protected regPassword = signal('');
  protected regAgree = signal(false);
  protected regWorking = signal(false);
  protected regError = signal<string | null>(null);
  /** When set, registration succeeded; the user must click the verify link to proceed. */
  protected pendingToken = signal<string | null>(null);
  protected verifying = signal(false);

  // --- Mock login (account stable) ---
  protected devUsers = signal<DevUser[]>([]);
  protected working = signal(false);

  // --- Mock initialization (seed) ---
  protected preset = signal('small');
  protected seeding = signal(false);
  protected seedMessage = signal<string | null>(null);

  // --- Full OAuth flow (primary sign-in) ---
  // The OAuth app name is what other clients show as each post's source, so it
  // carries the product name: the hosted flavor when served from mawkingbird.com,
  // the generic open-source name anywhere else (self-hosts, localhost).
  protected appName = signal(
    (window.location?.hostname ?? '').toLowerCase().includes('mawkingbird')
      ? 'Mawkingbird'
      : 'Mockingbird',
  );
  protected oauthWorking = signal(false);
  protected oauthError = signal<string | null>(null);

  /**
   * How much authority to ask the instance for.
   *
   * A stranger's web client asking for write access to your account is a fair
   * thing to hesitate over, and "read only" is a real answer rather than a
   * placebo: the scope is requested at app-registration time, so the token the
   * instance issues genuinely cannot post, follow or change anything. The
   * trade-off is that the parts of the app that write will fail, which is why
   * the option says so rather than hiding it.
   */
  protected oauthAccess = signal<OAuthAccess>('full');
  protected readonly accessChoices = ACCESS_CHOICES;

  /** Analytics opt-out, offered before signing in rather than buried in settings. */
  protected prefs = inject(ClientPrefs);

  ngOnInit(): void {
    // Already signed in? Landing on /login/mastodon (bookmark, stale tab, back button)
    // shouldn't demand a fresh login cycle — verify the stored token and go straight home.
    // An OAuth callback (?code=) and the explicit add-account flow (?add=1) still show the
    // page; a dead token just leaves the user here.
    const params = this.route.snapshot.queryParamMap;
    if (!params.get('code') && !params.get('add') && this.auth.isAuthenticated) {
      if (this.auth.isAnonymous) {
        void this.router.navigateByUrl('/home');
        return;
      }
      this.api.verifyCredentials().subscribe({
        next: (acc) => {
          this.auth.setAccount(acc);
          void this.router.navigateByUrl('/home');
        },
        error: () => {
          // Token no longer works; stay on the login page.
        },
      });
    }
    // Onboarding default: Mocking Bird has no "this server", so rather than greeting
    // a new user with an empty picker, preselect the biggest general-purpose instance.
    if (!this.server.allowsThisServer && !this.server.baseUrl()) {
      this.server.setBaseUrl('https://mastodon.social');
    }
    this.customServer.set(this.server.isMock ? '' : this.server.baseUrl());
    // Warm the curated joinmastodon index (cached; weekly refresh) so the picker can
    // suggest real, described instances the moment the user focuses the field.
    this.mastodonServers.ensureLoaded();
    // The dev-user stable is mock-server-only. In Mocking Bird the MockApi is a stub that
    // throws, so only poll it when the mock tooling is actually present.
    if (this.mockTooling && this.server.isMock) {
      this.refreshDevUsers();
    }
    this.handleOAuthCallback();
  }

  selectTab(tab: Tab): void {
    this.tab.set(tab);
  }

  /** Enter the real application as the one browser-local Anonymous account. */
  continueAnonymously(discoveredServer?: string): void {
    const selected = discoveredServer || this.server.baseUrl() || 'https://mastodon.social';
    this.auth.enterAnonymous(selected);
    void this.router.navigateByUrl('/home');
  }

  ngOnDestroy(): void {
    if (this.serverDebounce) {
      clearTimeout(this.serverDebounce);
    }
  }

  selectServer(baseUrl: string): void {
    this.server.setBaseUrl(baseUrl);
    this.customServer.set(baseUrl);
    this.serverStatus.set('idle');
    this.serverTitle.set(null);
    this.mediaHost.set(null);
    this.pendingDegradedServer.set(null);
    // Dev users only exist on the local mock; skip the call (and its throwing stub) when
    // we've switched to a real instance or this is the Mocking Bird build.
    if (this.mockTooling && this.server.isMock) {
      this.refreshDevUsers();
    }
  }

  /** Probe domain-like text and switch on success; degraded media requires confirmation. */
  onServerInput(value: string): void {
    // Invalidate an in-flight probe even when the replacement text is not yet a domain.
    this.probeSeq += 1;
    this.customServer.set(value);
    this.serverStatus.set('idle');
    this.serverTitle.set(null);
    this.mediaHost.set(null);
    this.pendingDegradedServer.set(null);
    this.refreshSuggestions(value);
    if (this.serverDebounce) {
      clearTimeout(this.serverDebounce);
    }
    if (!DOMAIN_RE.test(value.trim())) {
      return;
    }
    this.serverDebounce = setTimeout(() => this.probeAndApply(value), 500);
  }

  /** Recompute the curated-instance suggestions for the current combo text. */
  private refreshSuggestions(value: string): void {
    const matches = this.mastodonServers.search(value);
    // Don't show a one-item list that just echoes an exact domain the user already typed.
    const echo = matches.length === 1 && matches[0].domain === value.trim().toLowerCase();
    this.serverSuggestions.set(echo ? [] : matches);
  }

  /** Field focused: open the dropdown with default (or current-query) suggestions. */
  onServerFocus(): void {
    this.refreshSuggestions(this.customServer());
    this.suggestOpen.set(true);
  }

  /** Blur closes the dropdown, but not before a click on an option can register. */
  onServerBlur(): void {
    setTimeout(() => this.suggestOpen.set(false), 150);
  }

  /** Pick a suggested instance: fill the field and probe it immediately. */
  chooseSuggestion(s: ServerSuggestion): void {
    if (this.serverDebounce) {
      clearTimeout(this.serverDebounce);
    }
    this.customServer.set(s.domain);
    this.serverSuggestions.set([]);
    this.suggestOpen.set(false);
    void this.probeAndApply(s.domain);
  }

  /** A rough "big / mid / cozy" size label for a suggestion row. */
  sizeLabel(users: number): string {
    if (users >= 100_000) return 'very large';
    if (users >= 10_000) return 'large';
    if (users >= 1_000) return 'mid-size';
    if (users > 0) return 'cozy';
    return '';
  }

  /** Enter in the combo: don't wait for the debounce. */
  applyServerNow(): void {
    if (this.serverDebounce) {
      clearTimeout(this.serverDebounce);
    }
    void this.probeAndApply(this.customServer());
  }

  /** Select a reachable server after warning that its media host is unavailable. */
  useDegradedServer(): void {
    const base = this.pendingDegradedServer();
    if (!base) {
      return;
    }
    this.server.setBaseUrl(base);
    this.pendingDegradedServer.set(null);
  }

  private async probeAndApply(value: string): Promise<void> {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!DOMAIN_RE.test(trimmed)) {
      return;
    }
    // Quietly supply the scheme: https for real hosts, http for localhost / IPs.
    const base = normalizeHostUrl(trimmed);
    const seq = ++this.probeSeq;
    this.pendingDegradedServer.set(null);
    this.mediaHost.set(null);
    this.suggestOpen.set(false);
    this.serverStatus.set('checking');
    try {
      const result = await probeServerAvailability(base);
      if (seq !== this.probeSeq) {
        return; // a newer probe superseded this one
      }
      if (result.status === 'unreachable') {
        this.serverStatus.set('unreachable');
        return;
      }
      this.serverTitle.set(result.title || null);
      this.mediaHost.set(result.mediaUrl ? new URL(result.mediaUrl).host : null);
      if (result.status === 'degraded') {
        this.pendingDegradedServer.set(base);
        this.serverStatus.set('degraded');
        return;
      }
      this.pendingDegradedServer.set(null);
      this.server.setBaseUrl(base);
      this.serverStatus.set('ok');
    } catch {
      if (seq === this.probeSeq) {
        this.serverStatus.set('unreachable');
      }
    }
  }

  /** Short host label for the server whose probe result is currently displayed. */
  protected probedServerHostLabel(): string {
    return normalizeHostUrl(this.customServer()).replace(/^https?:\/\//, '');
  }

  // ---------- Sign in with a pasted token ----------

  submit(): void {
    const value = this.token().trim();
    if (!value) {
      return;
    }
    this.error.set(null);
    this.checking.set(true);
    this.auth.setToken(value);
    this.api.verifyCredentials().subscribe({
      next: (acc) => {
        // If this identity is already in the stable under a different token
        // (e.g. re-running OAuth for an account you're already signed into),
        // don't pile up a duplicate session — drop the fresh token and switch to
        // the existing one. Otherwise commit the new session.
        if (!this.adoptExistingSession(acc, value)) {
          this.auth.setAccount(acc);
        }
        this.checking.set(false);
        this.router.navigateByUrl('/home');
      },
      error: () => {
        this.auth.removeSession(value);
        this.checking.set(false);
        this.error.set('That token was rejected. Check it and try again.');
      },
    });
  }

  /**
   * If another saved session is the *same account on the same instance* as the
   * one we just verified, replace its old credential with the newly-minted one
   * instead of creating a duplicate identity. Returns true when adopted.
   */
  private adoptExistingSession(acc: Account, newToken: string): boolean {
    const server = this.server.baseUrl();
    const existing = this.auth
      .sessions()
      .find((s) => s.token !== newToken && s.account?.id === acc.id && (s.server ?? '') === server);
    if (!existing) {
      return false;
    }
    return this.auth.adoptReauthorizedSession(acc, newToken, server);
  }

  // ---------- Register (mock-server-only signup) ----------

  /** Register an app for a client_credentials token, then create the account. */
  register(): void {
    if (!this.regUsername().trim() || !this.regEmail().trim() || !this.regPassword()) {
      this.regError.set('Username, email and password are required.');
      return;
    }
    if (!this.regAgree()) {
      this.regError.set('You must accept the server rules to sign up.');
      return;
    }
    this.regError.set(null);
    this.regWorking.set(true);
    const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';
    this.api.registerApp('mastodon_mock signup', redirectUri).subscribe({
      next: (app) => {
        this.api.clientCredentialsToken(app.client_id, app.client_secret).subscribe({
          next: (appTok) => {
            this.api
              .register(appTok.access_token, {
                username: this.regUsername().trim(),
                email: this.regEmail().trim(),
                password: this.regPassword(),
                agreement: true,
              })
              .subscribe({
                next: (userTok) => {
                  this.regWorking.set(false);
                  // Don't sign in yet — wait for the (fake) email verification click.
                  this.pendingToken.set(userTok.access_token);
                },
                error: (err) => {
                  this.regWorking.set(false);
                  this.regError.set(this.describeRegError(err));
                },
              });
          },
          error: () => {
            this.regWorking.set(false);
            this.regError.set('Could not obtain an app token.');
          },
        });
      },
      error: () => {
        this.regWorking.set(false);
        this.regError.set('Could not register the signup app.');
      },
    });
  }

  /** Exercise the confirmation endpoint, then sign the new account in. */
  confirmAndEnter(): void {
    const tok = this.pendingToken();
    if (!tok) {
      return;
    }
    this.verifying.set(true);
    this.api.confirmEmail().subscribe({
      next: () => this.enterWith(tok),
      // The mock no-ops; even a failure shouldn't trap the new user.
      error: () => this.enterWith(tok),
    });
  }

  private enterWith(tok: string): void {
    this.verifying.set(false);
    this.pendingToken.set(null);
    this.auth.setToken(tok);
    this.api.verifyCredentials().subscribe({
      next: (acc) => {
        this.auth.setAccount(acc);
        this.router.navigateByUrl('/home');
      },
      error: () => this.router.navigateByUrl('/home'),
    });
  }

  private describeRegError(err: unknown): string {
    const detail = (err as { error?: { detail?: unknown } })?.error?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    return 'Sign-up failed — that username may be taken.';
  }

  // ---------- Mock login: dev users + account switching ----------

  generate(admin: boolean): void {
    this.working.set(true);
    this.mockApi.createDevUser(admin).subscribe({
      next: (user) => {
        this.working.set(false);
        this.enterAsDevUser(user);
        this.refreshDevUsers();
      },
      error: () => this.working.set(false),
    });
  }

  /** One-click login as an existing dev user: mint a token and add it to the stable. */
  loginAs(user: DevUser): void {
    this.working.set(true);
    this.error.set(null);
    this.mockApi.mockLogin(user.username).subscribe({
      next: (tok) => {
        this.working.set(false);
        this.enterWith(tok.access_token);
      },
      error: () => {
        this.working.set(false);
        this.error.set(`Could not log in as @${user.username}.`);
      },
    });
  }

  /** A freshly-generated dev user already carries a token; use it directly. */
  private enterAsDevUser(user: DevUser): void {
    this.enterWith(user.access_token);
  }

  refreshDevUsers(): void {
    this.mockApi.listDevUsers().subscribe({
      next: (users) => this.devUsers.set(users),
      error: () => this.devUsers.set([]),
    });
  }

  // ---------- Mock initialization: seed ----------

  seedSample(): void {
    this.seeding.set(true);
    this.seedMessage.set(null);
    this.mockApi.seedSampleData(this.preset()).subscribe({
      next: ({ report }) => {
        this.seeding.set(false);
        this.seedMessage.set(
          `Created ${report.accounts.toLocaleString()} accounts, ` +
            `${report.statuses.toLocaleString()} statuses in ${report.total_seconds.toFixed(2)}s`,
        );
        this.refreshDevUsers();
      },
      error: (err) => {
        this.seeding.set(false);
        this.seedMessage.set(
          err?.error?.detail ?? this.transloco.translate<string>('pages.login.seedFailed'),
        );
      },
    });
  }

  // ---------- Full OAuth flow ----------

  /**
   * If we just came back from /oauth/authorize with a ?code=, exchange it for a
   * token — but only after proving the callback belongs to the flow we started.
   *
   * The pending record is consumed up front, so a code is never redeemed twice
   * and a failed attempt cannot leave usable client credentials sitting in
   * sessionStorage for a later injected code to pick up.
   */
  private handleOAuthCallback(): void {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    if (!code) {
      return;
    }
    const app = this.takePendingOAuth();
    if (!app) {
      // A code with nothing pending is either a stale tab or someone else's
      // code pushed at us. Either way there is nothing legitimate to redeem.
      this.oauthError.set('That sign-in link is no longer valid. Start again from this page.');
      return;
    }
    if (!statesMatch(app.state, params.get('state'))) {
      this.oauthError.set(
        'Sign-in could not be verified (state mismatch) and was stopped. Start again from this page.',
      );
      return;
    }
    // The code is only redeemable at the instance that issued it; if the
    // selected server drifted (another tab, a restored session), put it back.
    if (this.server.baseUrl() !== app.server) {
      this.server.setBaseUrl(app.server);
    }
    this.oauthWorking.set(true);
    this.api
      .exchangeCode({
        clientId: app.clientId,
        clientSecret: app.clientSecret,
        redirectUri: app.redirectUri,
        code,
        codeVerifier: app.codeVerifier,
      })
      .subscribe({
        next: (tok) => {
          this.oauthWorking.set(false);
          this.router.navigate([], { queryParams: {} });
          this.token.set(tok.access_token);
          this.submit();
        },
        error: () => {
          this.oauthWorking.set(false);
          this.oauthError.set('Code exchange failed.');
        },
      });
  }

  /** Read and clear the pending OAuth record; returns null if absent or corrupt. */
  private takePendingOAuth(): StoredApp | null {
    const raw = sessionStorage.getItem(OAUTH_APP_KEY);
    sessionStorage.removeItem(OAUTH_APP_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredApp>;
      return typeof parsed.clientId === 'string' &&
        typeof parsed.redirectUri === 'string' &&
        typeof parsed.state === 'string' &&
        parsed.state.length > 0
        ? (parsed as StoredApp)
        : null;
    } catch {
      return null;
    }
  }

  /** Register a throwaway app, then redirect through the server's account-picker. */
  startOAuth(): void {
    this.oauthError.set(null);
    this.oauthWorking.set(true);
    // Resolve against <base href> (the app may be served from a sub-path like /_ui/).
    const redirectUri = new URL('login', document.baseURI).toString();
    const server = this.server.baseUrl();
    // Scope is fixed here, at registration: the instance mints the token against
    // the app's registered scopes, so a read-only choice cannot be widened later
    // by this client.
    this.api.registerApp(this.appName(), redirectUri, ACCESS_SCOPES[this.oauthAccess()]).subscribe({
      next: (app) => {
        // PKCE: only the challenge travels to the instance; the verifier stays here.
        const state = createOAuthState();
        const codeVerifier = createCodeVerifier();
        void codeChallengeFor(codeVerifier).then((codeChallenge) => {
          const stored: StoredApp = {
            clientId: app.client_id,
            clientSecret: app.client_secret,
            redirectUri,
            state,
            codeVerifier,
            server,
          };
          sessionStorage.setItem(OAUTH_APP_KEY, JSON.stringify(stored));
          const params = new URLSearchParams({
            client_id: app.client_id,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: app.scopes.join(' '),
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
          });
          // The instance itself handles this redirect in the user's browser, so it works
          // even when redirectUri points back at an unreachable local dev server.
          const authorizeBase = server || window.location.origin;
          window.location.href = `${authorizeBase}/oauth/authorize?${params.toString()}`;
        });
      },
      error: () => {
        this.oauthWorking.set(false);
        this.oauthError.set('Could not register the app.');
      },
    });
  }
}
