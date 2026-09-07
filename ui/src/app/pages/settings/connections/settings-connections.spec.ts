import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskySession, BskySession } from '../../../providers/bluesky/bluesky-session';
import { DropboxSession } from '../../../providers/dropbox/dropbox-session';
import { GitHubSession } from '../../../providers/github/github-session';
import { CredentialLifetimeStore } from '../../../providers/credential-lifetime';
import { CorsProxySettings } from '../../../providers/cors-proxy/cors-proxy-settings';
import { ShortenerSettings } from '../../../providers/shortener/shortener-settings';
import { TwitterSettings } from '../../../providers/twitter/twitter-settings';
import { MataroaSettings } from '../../../providers/mataroa/mataroa-settings';
import { GistSettings } from '../../../providers/paste/gist-settings';
import { CONNECTION_CATALOG } from './connection-catalog';
import { SettingsConnections } from './settings-connections';
import { VaultService, type VaultState } from '../../../providers/vault/vault-service';
import { VaultPreference } from '../../../providers/vault/vault-preference';
import { ProfileAccountKey } from '../../../providers/account/profile-account-key';
import { Auth } from '../../../auth';

describe('SettingsConnections (catalog)', () => {
  let bskySession: {
    session: WritableSignal<BskySession | null>;
    expiresAt: ReturnType<typeof vi.fn>;
    enforceLifetime: ReturnType<typeof vi.fn>;
  };
  let githubSession: {
    connected: WritableSignal<boolean>;
    needsFetch: WritableSignal<boolean>;
    expiresAt: ReturnType<typeof vi.fn>;
    enforceLifetime: ReturnType<typeof vi.fn>;
  };
  let dropboxSession: { connected: WritableSignal<boolean>; configured: boolean };
  let vaultState: WritableSignal<VaultState>;
  let vaultHasConnector: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    bskySession = {
      session: signal<BskySession | null>(null),
      expiresAt: vi.fn(() => null),
      enforceLifetime: vi.fn(),
    };
    // The page governs this session under the credential-retention policy, so
    // the stub has to answer both halves of that contract.
    githubSession = {
      connected: signal(false),
      needsFetch: signal(false),
      expiresAt: vi.fn(() => null),
      enforceLifetime: vi.fn(),
    };
    dropboxSession = { connected: signal(false), configured: true };
    vaultState = signal<VaultState>('unlocked');
    vaultHasConnector = vi.fn(() => false);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlueskySession, useValue: bskySession },
        { provide: GitHubSession, useValue: githubSession },
        { provide: DropboxSession, useValue: dropboxSession },
        {
          provide: VaultService,
          useValue: {
            state: vaultState,
            unlocked: () => vaultState() === 'unlocked',
            hasConnector: vaultHasConnector,
            refresh: vi.fn(async () => undefined),
          },
        },
        {
          provide: VaultPreference,
          useValue: { available: true, enabled: signal(true) },
        },
        { provide: ProfileAccountKey, useValue: { current: () => 'mastodon:social/alice' } },
      ],
    });
  });

  function setUp(): ComponentFixture<SettingsConnections> {
    const fixture = TestBed.createComponent(SettingsConnections);
    fixture.detectChanges();
    return fixture;
  }

  function cards(fixture: ComponentFixture<SettingsConnections>): HTMLAnchorElement[] {
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        'a.catalog-card',
      ),
    ];
  }

  /**
   * Find a card by its *heading*, not by any text anywhere inside it.
   *
   * A substring match over the whole card was ambiguous the moment a connector
   * mentioned another one in its copy: the Hugo card says it needs a GitHub
   * token, so `cardFor(…, 'GitHub')` matched Hugo whenever Hugo sorted first.
   * The heading is the card's identity, so that is what to match on.
   */
  function cardFor(
    fixture: ComponentFixture<SettingsConnections>,
    label: string,
  ): HTMLAnchorElement {
    return cards(fixture).find(
      (card) => card.querySelector('.catalog-label')?.textContent?.trim() === label,
    )!;
  }

  /** Every rendered card's heading — for asserting what is and is not listed. */
  function headings(fixture: ComponentFixture<SettingsConnections>): string[] {
    return cards(fixture).map(
      (card) => card.querySelector('.catalog-label')?.textContent?.trim() ?? '',
    );
  }

  it('lists every connector with its pitch and what it enables', () => {
    const fixture = setUp();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    // Every connector except the account's own network. These specs run
    // Mastodon-primary, so the Mastodon row is not a connector here — you
    // cannot connect to yourself, and the row it used to render was permanent
    // furniture explaining an impossibility. See `isOwnIdentity`.
    expect(cards(fixture)).toHaveLength(CONNECTION_CATALOG.length - 1);
    expect(text).not.toContain('it is your account here, not a connector');
    for (const label of ['Bluesky', 'Raindrop.io', 'GitHub', 'Dropbox']) {
      expect(text).toContain(label);
    }
    // The catalog's whole job is saying what you get, not how to set it up.
    expect(text).toContain('Bluesky posts merged into your home timeline');
    expect(text).toContain('Read your unread notifications');
    expect(text).not.toContain('app password');
  });

  /**
   * You cannot connect to your own account.
   *
   * Mastodon under a Mastodon-primary account, and Bluesky under a
   * Bluesky-primary one, used to render greyed with "it is your account here,
   * not a connector" — a permanent row explaining an impossibility, sitting
   * above the connectors the reader actually came for. Unlike a missing app key
   * or a rollout flag, this state never resolves while the account is active,
   * so the row is not an offer and does not belong in a list of offers.
   */
  describe('the account own network', () => {
    /**
     * Make Auth report Bluesky-primary.
     *
     * `Auth.kind` is seeded from storage at construction, and Auth is a root
     * singleton — so writing these keys is not enough on its own if the
     * injector has already built it. Overriding the getter is the honest way to
     * say "this account is Bluesky-primary" without depending on when the
     * fixture happens to instantiate Auth.
     */
    function beBlueskyPrimary(): void {
      vi.spyOn(TestBed.inject(Auth), 'isBlueskyPrimary', 'get').mockReturnValue(true);
    }

    it('hides the Bluesky row when Bluesky is the identity', () => {
      beBlueskyPrimary();
      const fixture = setUp();

      expect(headings(fixture)).not.toContain('Bluesky');
      // Mastodon becomes a real connector for this account, so it comes back.
      expect(headings(fixture)).toContain('Mastodon');
    });

    it('hides the Mastodon row when Mastodon is the identity', () => {
      const fixture = setUp();

      expect(headings(fixture)).not.toContain('Mastodon');
      expect(headings(fixture)).toContain('Bluesky');
    });

    it('never hides both at once', () => {
      // The two rules are complementary, not additive: whichever network you
      // signed in with, the other is still a connector you can add.
      beBlueskyPrimary();
      const withBsky = headings(setUp());
      expect(withBsky.includes('Mastodon') || withBsky.includes('Bluesky')).toBe(true);
    });
  });

  it('says who each connection belongs to', () => {
    const fixture = setUp();
    // Bluesky asserts who this persona also is, so it is the per-account one
    // (scopedKey). Raindrop and OpenRouter belong to the human, so they are
    // unscoped; Dropbox is unscoped too but lives in sessionStorage.
    expect(cardFor(fixture, 'Bluesky').textContent).toContain('One per account');
    expect(cardFor(fixture, 'GitHub').textContent).toContain('One per account');
    expect(cardFor(fixture, 'Raindrop.io').textContent).toContain('All accounts');
    expect(cardFor(fixture, 'OpenRouter').textContent).toContain('All accounts');
    expect(cardFor(fixture, 'Dropbox').textContent).toContain('All accounts, this tab');
  });

  it('each card links to that connector’s own page', () => {
    const fixture = setUp();
    expect(cardFor(fixture, 'GitHub').getAttribute('href')).toBe('/settings/connections/github');
    expect(cardFor(fixture, 'Bluesky').getAttribute('href')).toBe('/settings/connections/bluesky');
  });

  it('shows connected state per connector, live', () => {
    const fixture = setUp();
    expect(cardFor(fixture, 'GitHub').textContent).toContain('Not connected');

    githubSession.connected.set(true);
    fixture.detectChanges();
    expect(cardFor(fixture, 'GitHub').textContent).toContain('Connected');
    // Unrelated connectors are unmoved.
    expect(cardFor(fixture, 'Dropbox').textContent).toContain('Not connected');
  });

  it('shows Plus storage beside connected state and scope without opening each connector', () => {
    bskySession.session.set({
      service: 'https://bsky.social',
      handle: 'me.bsky.social',
      did: 'did:plc:me',
      accessJwt: 'a',
      refreshJwt: 'r',
    });
    githubSession.connected.set(true);
    vaultHasConnector.mockImplementation((connector: string) => connector === 'github');

    const fixture = setUp();
    const bluesky = cardFor(fixture, 'Bluesky').textContent ?? '';
    const github = cardFor(fixture, 'GitHub').textContent ?? '';

    expect(bluesky).toContain('Connected');
    expect(bluesky).toContain('One per account');
    expect(bluesky).toContain('Not stored with Mawkingbird');
    expect(github).toContain('Connected');
    expect(github).toContain('One per account');
    expect(github).toContain('Stored with Mawkingbird');
  });

  it('does not guess when the encrypted inventory is locked', () => {
    githubSession.connected.set(true);
    vaultState.set('locked');
    const fixture = setUp();

    expect(cardFor(fixture, 'GitHub').textContent).toContain('Unlock Plus to check');
  });

  it('renders an unavailable connector greyed with the reason rather than hiding it', () => {
    dropboxSession.configured = false;
    const fixture = setUp();

    const dropbox = cardFor(fixture, 'Dropbox');
    expect(dropbox.classList).toContain('unavailable');
    expect(dropbox.textContent).toContain('Unavailable');
    expect(dropbox.textContent).toContain('app key is missing');

    // Nothing disappeared: unavailable is a state, not a removal. Dropbox with
    // no app key is something you *could* have and don't, so the row stays as
    // an offer.
    //
    // That is the opposite of the account's own network (the -1 here), which is
    // not an offer at all and will never become one while this account is
    // active. Both rules live in `isOwnIdentity`.
    expect(cards(fixture)).toHaveLength(CONNECTION_CATALOG.length - 1);
  });

  it('governs every credential-bearing session and enforces on init', () => {
    const enforceAll = vi.spyOn(TestBed.inject(CredentialLifetimeStore), 'enforceAll');
    const govern = vi.spyOn(TestBed.inject(CredentialLifetimeStore), 'govern');
    setUp();

    expect(govern).toHaveBeenCalledOnce();
    // Every connector holding a durable credential: all but session-only
    // Dropbox, plus the CORS proxy, whose API key is billable and ages out on
    // the same policy as the pasted tokens, plus the link-shortener keys (which
    // can create and delete links on a domain the user publishes under), plus
    // the optional Pastepile key (pasted on the Pastes page, but a stored
    // secret all the same), plus the Twitter data-service key (which spends a prepaid
    // credit balance), plus the Hugo repo's write token, plus the gist token
    // (which can rewrite and delete gists on the account).
    const governed = govern.mock.calls[0][0];
    expect(governed).toHaveLength(11);
    // Asserted by identity, not just by count: a bare length check passes just
    // as happily when a connector is swapped for the wrong one.
    expect(governed).toContain(TestBed.inject(CorsProxySettings));
    expect(governed).toContain(TestBed.inject(ShortenerSettings));
    expect(governed).toContain(TestBed.inject(TwitterSettings));
    expect(governed).toContain(TestBed.inject(MataroaSettings));
    expect(governed).toContain(TestBed.inject(GistSettings));
    expect(enforceAll).toHaveBeenCalled();
  });

  it('offers the connection doctor below the catalog', () => {
    const fixture = setUp();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a.doctor-link',
    );
    expect(link?.getAttribute('href')).toBe('/settings/connections/doctor');
    // Its whole value is being usable *before* you have set anything up.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('needs no keys');
  });

  it('writes the retention policy through the store', () => {
    const fixture = setUp();
    const lifetimes = TestBed.inject(CredentialLifetimeStore);
    const el = fixture.nativeElement as HTMLElement;

    const thirtyDays = [...el.querySelectorAll<HTMLInputElement>('.lifetime-option input')].find(
      (input) => input.value === '30d',
    )!;
    thirtyDays.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(lifetimes.lifetime()).toBe('30d');
    // Shortening the window must re-check what is already stored, not wait for a reload.
    expect(bskySession.enforceLifetime).toHaveBeenCalled();
  });
});
