import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Auth } from '../../../auth';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { MastodonConnector } from '../../../providers/mastodon/mastodon-connector';
import { DropboxSession } from '../../../providers/dropbox/dropbox-session';
import { RaindropSession } from '../../../providers/raindrop/raindrop-session';
import { GitHubSession } from '../../../providers/github/github-session';
import { OpenRouterSession } from '../../../providers/openrouter/openrouter-session';
import { CorsProxySettings } from '../../../providers/cors-proxy/cors-proxy-settings';
import { PastepileKey } from '../../../providers/paste/pastepile-key';
import { ShortenerSettings } from '../../../providers/shortener/shortener-settings';
import { TwitterSettings } from '../../../providers/twitter/twitter-settings';
import { MataroaSettings } from '../../../providers/mataroa/mataroa-settings';
import { GistSettings } from '../../../providers/paste/gist-settings';
import { BloggerSession } from '../../../providers/blogger/blogger-session';
import { HugoSettings } from '../../../providers/hugo/hugo-settings';
import {
  CREDENTIAL_LIFETIME_OPTIONS,
  CredentialLifetime,
  CredentialLifetimeStore,
} from '../../../providers/credential-lifetime';
import { FeatureFlags } from '../../../feature-flags';
import { ProfileAccountKey } from '../../../providers/account/profile-account-key';
import { VAULTED_KEYS } from '../../../providers/vault/vault-manifest';
import { VaultPreference } from '../../../providers/vault/vault-preference';
import { VaultService } from '../../../providers/vault/vault-service';
import { VaultAdoption } from '../../../providers/vault/vault-adoption';
import {
  CONNECTION_CATALOG,
  CONNECTION_FLAGS,
  CONNECTION_SCOPE_COPY,
  ConnectionCatalogEntry,
  ConnectionId,
} from './connection-catalog';
import { type CredentialLocation, StorageBadge } from './storage-badge';

/** A catalog entry joined to the live state only the injector can supply. */
export interface ConnectionCatalogRow {
  entry: ConnectionCatalogEntry;
  connected: boolean;
  /** Where this connector's credential is kept, or null when none exists yet. */
  storage: CredentialLocation | null;
  /**
   * Why this connector cannot be used in this build or by this account, or
   * null when it can. An unavailable entry still renders — greyed, with the
   * reason — because a connector that silently vanishes is a support question.
   */
  unavailableReason: string | null;
  /**
   * True when {@link unavailableReason} is a rollout flag rather than a fact
   * about the build. Only this case gets a link to the flags page, because only
   * this case is something the reader can change.
   */
  flagged: boolean;
}

/**
 * Connections: the catalog. Every connector is one account somewhere else, and
 * each gets its own child page under `/settings/connections/<id>` — this page
 * only answers "what is there, what does it get me, is it on?".
 *
 * The credential-retention policy stays here rather than on any child because
 * it governs all of them at once.
 */
// i18n settings.connections.title: Connections
// i18n settings.connections.intro: Follow your people wherever they post. Mastodon is home — a connection is one account somewhere else, merged in as a guest. Credentials work from this browser first; supported low-churn keys can also be encrypted with Mawkingbird Plus and synced to your other devices. Each connected card says which is true.
// i18n settings.connections.rssBefore: Subscribing to many feeds at once isn't a connection — that lives under
// i18n settings.connections.rssLink: RSS feeds
// i18n settings.connections.vaultClosed: The encrypted inventory is closed, so some badges cannot be verified.
// i18n settings.connections.openPlus: Open Mawkingbird Plus
// i18n settings.connections.openPlusAfter: once to unlock it or see why it is unavailable.
// i18n settings.connections.catalogAriaLabel: Available connections
// i18n settings.connections.pillTurnedOff: Turned off
// i18n settings.connections.pillUnavailable: Unavailable
// i18n settings.connections.pillConnected: Connected
// i18n settings.connections.pillNotConnected: Not connected
// i18n settings.connections.turnBackOn: Turn it back on in feature flags
// i18n settings.connections.doctorHeading: 🩺 Connection doctor
// i18n settings.connections.doctorBody: Some networks block whole categories of site. Rather than finding that out after making an account, buying credits and pasting in a key, check first: the doctor asks every service above whether this network will let your browser reach it. It needs no keys and uses none of the ones you have saved.
// i18n settings.connections.doctorLink: Check what this network allows
// i18n settings.connections.retentionHeading: 🔑 How long to keep credentials
// i18n settings.connections.retentionBody: GitHub and Raindrop.io use a pasted long-lived token. Bluesky exchanges the one-time login secret you enter for rotating session tokens, then discards that secret. There is no unencrypted server copy: credentials sit in this browser until something removes them. Supported low-churn credentials may also have an end-to-end encrypted Mawkingbird Plus copy; Bluesky's rotating session tokens do not. The badges above report the difference. Pick how long the local copy should remain — a Plus-backed credential locks here at the limit, while a browser-only credential disconnects. Reconnecting restarts the clock.
// i18n settings.connections.retentionDropboxNote: This does not apply to Dropbox, which uses a proper OAuth flow with short-lived tokens that expire on their own.
// i18n settings.connections.retentionAriaLabel: Credential retention
// i18n settings.connections.retentionNeverWarning: Nothing will expire on its own. Revoke tokens at the provider when you stop using a connection.
// i18n settings.connections.mastodonAnonymousActive: Anonymous browsing already reads a Mastodon server — change it in Settings → Anonymous.
// i18n settings.connections.mastodonAlreadySignedIn: You are signed in to Mastodon already — it is your account here, not a connector.
// i18n settings.connections.blueskyAlreadySignedIn: You are signed in to Bluesky already — it is your account here, not a connector.
// i18n settings.connections.dropboxNotConfigured: Not configured for this build — the Dropbox app key is missing.
@Component({
  selector: 'app-settings-connections',
  imports: [RouterLink, StorageBadge, TranslocoPipe],
  templateUrl: './settings-connections.html',
  styleUrl: './settings-connections.css',
})
export class SettingsConnections implements OnInit {
  private auth = inject(Auth);
  private transloco = inject(TranslocoService);
  private bsky = inject(BlueskySession);
  private mastodon = inject(MastodonConnector);
  private dropbox = inject(DropboxSession);
  private raindrop = inject(RaindropSession);
  private github = inject(GitHubSession);
  private openrouter = inject(OpenRouterSession);
  private corsProxy = inject(CorsProxySettings);
  private shortener = inject(ShortenerSettings);
  private twitter = inject(TwitterSettings);
  private mataroa = inject(MataroaSettings);
  private gist = inject(GistSettings);
  private blogger = inject(BloggerSession);
  private hugo = inject(HugoSettings);
  // Not a catalog entry — a paste service is a list, not a one-account
  // connector, so the key is managed on the Pastes page. Governed here anyway,
  // because a stored secret obeys the retention policy wherever it was created.
  private pastepileKey = inject(PastepileKey);
  protected lifetimes = inject(CredentialLifetimeStore);
  protected flags = inject(FeatureFlags);
  private vault = inject(VaultService);
  private vaultPreference = inject(VaultPreference);
  private accountKey = inject(ProfileAccountKey);
  private vaultReconciliation = inject(VaultAdoption);

  protected readonly lifetimeOptions = CREDENTIAL_LIFETIME_OPTIONS;
  protected readonly scopeCopy = CONNECTION_SCOPE_COPY;

  /**
   * The catalog joined to live connected/available state.
   *
   * The `switch` is the deliberate cost of keeping `connection-catalog.ts` free
   * of service imports (see the note there). Adding a connector means one entry
   * there and one case here.
   */
  protected readonly rows = computed<ConnectionCatalogRow[]>(() =>
    CONNECTION_CATALOG.map((entry) => {
      // A flag beats a build fact. Both can be true — Dropbox with no app key
      // *and* flagged off — and the flag is the one the reader can act on, so
      // it is the one the card explains.
      const flagReason = this.flags.disabledReason(CONNECTION_FLAGS[entry.id]);
      if (flagReason) {
        return {
          entry,
          connected: false,
          storage: null,
          unavailableReason: flagReason,
          flagged: true,
        };
      }
      const live = this.liveRow(entry);
      return {
        ...live,
        storage: this.credentialLocation(entry, live.connected),
        flagged: false,
      };
    }).filter((row) => !this.isOwnIdentity(row.entry.id)),
  );

  /**
   * Whether this connector is the account's *own* network.
   *
   * Mastodon under a Mastodon-primary account, and Bluesky under a
   * Bluesky-primary one, are not connectors at all — you cannot connect to
   * yourself. They used to render greyed with an explanation, on the general
   * rule that an unavailable connector is greyed rather than hidden. That rule
   * is right for something you *could* have and don't (a missing app key, a
   * rollout flag): the row is an offer, and hiding it hides the offer.
   *
   * It is wrong here. "You are signed in already" is not a state that will ever
   * change while this account is active, so the row is permanent furniture
   * explaining an impossibility — and it sat directly above the connector list
   * a reader actually came to use.
   *
   * Note the asymmetry with `flagged`: a flagged-off connector keeps greying,
   * because that one really is a temporary "not right now".
   */
  private isOwnIdentity(id: ConnectionId): boolean {
    if (id === 'bluesky') {
      return this.auth.isBlueskyPrimary;
    }
    if (id === 'mastodon') {
      // Anonymous is deliberately not included: it reads a Mastodon server, but
      // the row still offers a real choice (which server), so it keeps its
      // greyed explanation rather than vanishing.
      return !this.auth.isBlueskyPrimary && !this.auth.isAnonymous;
    }
    return false;
  }

  /** One unlock replaces thirteen trips into child pages when inventory is opaque. */
  protected readonly vaultInventoryNeedsAttention = computed(() =>
    this.rows().some((row) => row.storage === 'unknown'),
  );

  /** The catalog entry joined to its session state, ignoring rollout flags. */
  private liveRow(
    entry: ConnectionCatalogEntry,
  ): Omit<ConnectionCatalogRow, 'flagged' | 'storage'> {
    {
      switch (entry.id) {
        case 'mastodon':
          // The only connector that can be *not applicable* rather than merely
          // unconfigured. Under a Mastodon-primary account Mastodon is the
          // identity — there is no slot to fill — and under Anonymous the
          // browser-local persona already reads a Mastodon server of its own.
          // Both render greyed with the reason rather than vanishing, per the
          // note on `unavailableReason`.
          if (!this.auth.isBlueskyPrimary) {
            return {
              entry,
              connected: false,
              unavailableReason: this.auth.isAnonymous
                ? this.transloco.translate<string>('settings.connections.mastodonAnonymousActive')
                : this.transloco.translate<string>('settings.connections.mastodonAlreadySignedIn'),
            };
          }
          return { entry, connected: this.mastodon.optedIn(), unavailableReason: null };
        case 'bluesky':
          // The mirror of the Mastodon case: under a Bluesky-primary account,
          // Bluesky IS the identity and there is no slot to fill. Marked
          // not-applicable here; `rows` then drops it from the list entirely
          // (see the note there on why these two vanish rather than grey out).
          if (this.auth.isBlueskyPrimary) {
            return {
              entry,
              connected: false,
              unavailableReason: this.transloco.translate<string>(
                'settings.connections.blueskyAlreadySignedIn',
              ),
            };
          }
          // Available to every other account including Anonymous: the app
          // password is its own credential and needs no Mastodon token.
          return { entry, connected: this.bsky.session() !== null, unavailableReason: null };
        case 'openrouter':
          return { entry, connected: this.openrouter.connected(), unavailableReason: null };
        case 'raindrop':
          return { entry, connected: this.raindrop.connected(), unavailableReason: null };
        case 'github':
          return { entry, connected: this.github.connected(), unavailableReason: null };
        case 'dropbox':
          return {
            entry,
            connected: this.dropbox.connected(),
            unavailableReason: this.dropbox.configured
              ? null
              : this.transloco.translate<string>('settings.connections.dropboxNotConfigured'),
          };
        case 'cors-proxy':
          // "Connected" here means a proxy is selected *and* complete enough to
          // use — a proxy that needs a key and has none is configured, not
          // working, and saying otherwise would explain nothing when a feed
          // still fails.
          return {
            entry,
            connected: this.corsProxy.usable() || this.corsProxy.needsFetch(),
            unavailableReason: null,
          };
        case 'link-shortener':
          // Same standard as the proxy: a stored key with no short domain (which
          // Short.io requires) is configured but not usable, and the card should
          // not claim otherwise.
          return {
            entry,
            connected: this.shortener.usable() || this.needsVaultFetch(entry),
            unavailableReason: null,
          };
        case 'twitter':
          // Deliberately the weakest claim on this page: a key is stored and a
          // source is chosen. Unlike the others, that is genuinely not enough to
          // work — these services need a header-forwarding CORS proxy and a
          // consent on top — but the card is a directory entry, not a health
          // check, and the connector's own page owns the five-stage setup state.
          // Reporting "not connected" to someone who has pasted a valid key
          // would send them looking for a key problem that does not exist.
          return {
            entry,
            connected: this.twitter.usable() || this.needsVaultFetch(entry),
            unavailableReason: null,
          };
        case 'mataroa':
          return {
            entry,
            connected: this.mataroa.connected() || this.mataroa.needsFetch(),
            unavailableReason: null,
          };
        case 'blogger':
          // A build with no OAuth client id cannot offer this at all, which is
          // a fact about the build rather than something the user can fix —
          // the same shape as Dropbox with no app key.
          if (!this.blogger.configured) {
            return {
              entry,
              connected: false,
              unavailableReason: 'This build has no Blogger OAuth client id.',
            };
          }
          // "Connected" means publishable: signed in *and* a blog chosen.
          return { entry, connected: this.blogger.ready(), unavailableReason: null };
        case 'hugo':
          // Both halves: the repo can outlive the token, and in that state
          // nothing can be published.
          return {
            entry,
            connected: this.hugo.connected() || this.hugo.needsFetch(),
            unavailableReason: null,
          };
        case 'gist':
          return { entry, connected: this.gist.connected(), unavailableReason: null };
      }
    }
  }

  /**
   * Report actual encrypted inventory when it is open, and say when that fact
   * cannot be inspected. Eligibility alone is not proof that a write succeeded.
   */
  private credentialLocation(
    entry: ConnectionCatalogEntry,
    connected: boolean,
  ): CredentialLocation | null {
    const needsFetch = this.needsVaultFetch(entry);
    const vaultable = VAULTED_KEYS.some((key) => key.connector === entry.id);
    if (
      vaultable &&
      this.vaultPreference.available &&
      this.vault.unlocked() &&
      this.vault.hasConnector(entry.id, this.accountKey.current()) &&
      !connected &&
      !needsFetch
    ) {
      return 'available';
    }
    if (!connected && !needsFetch) {
      return null;
    }
    if (!this.usesCredential(entry)) {
      return 'none';
    }
    if (!vaultable || !this.vaultPreference.available) {
      return 'local';
    }
    if (this.vault.unlocked()) {
      const stored = this.vault.hasConnector(entry.id, this.accountKey.current());
      return stored ? (needsFetch ? 'locked' : 'vaulted') : 'local';
    }
    if (needsFetch) {
      return 'locked';
    }
    return this.vault.state() === 'absent' ? 'local' : 'unknown';
  }

  /** Whether this connected entry has a credential, rather than configuration only. */
  private usesCredential(entry: ConnectionCatalogEntry): boolean {
    switch (entry.id) {
      case 'mastodon':
        return this.mastodon.signedIn();
      case 'cors-proxy':
        return this.corsProxy.hasKey();
      case 'link-shortener': {
        const id = this.shortener.activeId();
        return id ? this.shortener.hasKey(id) : false;
      }
      default:
        return true;
    }
  }

  /** Whether local retention removed the plaintext while preserving the connection. */
  private needsVaultFetch(entry: ConnectionCatalogEntry): boolean {
    switch (entry.id) {
      case 'openrouter':
        return this.openrouter.needsFetch();
      case 'raindrop':
        return this.raindrop.needsFetch();
      case 'github':
        return this.github.needsFetch();
      case 'cors-proxy':
        return this.corsProxy.needsFetch();
      case 'link-shortener': {
        const id = this.shortener.activeId();
        return id ? this.shortener.needsFetch().includes(id) : false;
      }
      case 'twitter': {
        const id = this.twitter.activeId();
        return id ? this.twitter.needsFetch().includes(id) : false;
      }
      case 'mataroa':
        return this.mataroa.needsFetch();
      case 'hugo':
        return this.hugo.needsFetch();
      case 'gist':
        return this.gist.needsFetch();
      default:
        return false;
    }
  }

  async ngOnInit(): Promise<void> {
    // Tell the policy store which connectors it governs, then apply the current
    // policy: each session already dropped an over-age credential when it was
    // constructed, but a session built before the user shortened the window (or
    // one whose page has been open a long time) is re-checked here.
    //
    // This is the only page that governs the full set, because it owns the
    // policy picker below. A child page reached by deep link enforces its own
    // session on init instead.
    this.lifetimes.govern([
      this.github,
      this.raindrop,
      this.bsky,
      this.openrouter,
      this.corsProxy,
      this.shortener,
      this.twitter,
      this.mataroa,
      this.hugo,
      this.gist,
      this.pastepileKey,
    ]);
    this.lifetimes.enforceAll();
    if (this.vaultPreference.enabled()) {
      await this.vault.refresh();
      if (this.vault.unlocked()) {
        await this.vaultReconciliation.reconcileExisting();
      }
    }
  }

  /**
   * Change how long pasted credentials are kept. Shortening the window applies
   * at once, so anything already past the new limit disconnects here rather
   * than surviving until the next reload.
   */
  setLifetime(lifetime: CredentialLifetime): void {
    this.lifetimes.set(lifetime);
  }
}
