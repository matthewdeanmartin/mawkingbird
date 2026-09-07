import { Component, computed, inject, Injector, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PlusSession } from '../../../providers/account/plus-session';
import { authDebug } from '../../../providers/account/auth-debug';
import { MawkingbirdSession } from '../../../providers/account/mawkingbird-session';
import { SettingsSyncToggle } from '../../../providers/account/settings-sync-toggle';
import { PlusDiagnostics } from '../../../providers/account/plus-diagnostics';
import { ProfileSync } from '../../../providers/account/profile-sync';
import { PageDiagnostics } from '../../../page-diagnostics';
import { CorsProxyUsageStore } from '../../../providers/cors-proxy/cors-proxy-usage';
import { formatBytes } from '../../../observability/local-storage-inspector';
import { PlusFeatures } from '../../../providers/account/plus-features';
import { CorsProxySettings } from '../../../providers/cors-proxy/cors-proxy-settings';
import type { PlusFeature } from '../../../providers/account/plus-features';
import { PlusWelcomeDialog } from './plus-welcome-dialog/plus-welcome-dialog';
import { AdoptionDialog } from './adoption-dialog/adoption-dialog';
import { CollectionAdoptionRunner } from '../../../providers/account/collection-adoption-runner';
import type { AdoptableCollection } from '../../../providers/account/collection-adoption-runner';
import type { AdoptionChoice } from '../../../providers/account/collection-adoption';
import { VaultService } from '../../../providers/vault/vault-service';
import { VaultPreference } from '../../../providers/vault/vault-preference';
import { VaultAdoption } from '../../../providers/vault/vault-adoption';
import { FeatureFlags } from '../../../feature-flags';
import { PLUS_PRICE_USD_PER_YEAR, visiblePlusBenefits } from '../../../plus-benefits';
import { ArticleQuota, FREE_DAILY_ARTICLES } from '../../../providers/article/article-quota';
import { ArticleReadingTally } from '../../../providers/article/article-reading-tally';

/**
 * Settings → Mawkingbird Plus.
 *
 * Sign in with an email address, see who you are, sign out.
 *
 * The account is deliberately free and deliberately optional. Nothing in the
 * app requires one — the CORS proxy stays anonymous, feeds keep working signed
 * out — so this page has to be honest that there is currently little to gain by
 * signing in. Overselling it now would make the later, real pitch untrustworthy.
 *
 * ## No OAuth redirect to complete
 *
 * This page used to be the WorkOS redirect target and completed a code exchange
 * on load. It no longer does: signing in means receiving a link, and the link
 * lands on the account service, which sets a cookie and redirects back here
 * already signed in. There is nothing to unpack from the URL.
 */
// i18n settings.plus.sync.drifted: This browser and the saved data for {{account}} do not match. Syncing uploads shared settings and this active account's enabled collections; it does not change any other Mastodon account.
// i18n settings.plus.tally.articlesRead: Articles you've read in Mawkingbird
// i18n settings.plus.vault.wrongPassphrase: That passphrase did not open the vault.
// i18n settings.plus.vault.passphraseChanged: Passphrase changed on this encrypted store.
// i18n settings.plus.account.auth.email: Confirmed email address
// i18n settings.plus.account.auth.full: Full account
// i18n settings.plus.account.cancelledUntil: — cancelled, yours until
// i18n settings.plus.account.manageNote: Manage or cancel your subscription from the receipt email Stripe sent you. Cancelling stops the renewal; you keep Plus for the rest of the year you paid for.
// i18n settings.plus.account.plan.free: Free
// i18n settings.plus.account.plan.plus: Mawkingbird Plus
// i18n settings.plus.account.plan: Plan
// i18n settings.plus.account.renews: — renews
// i18n settings.plus.account.signIn: Sign-in
// i18n settings.plus.account.signOut: Sign out
// i18n settings.plus.account.signOutNote: Signing out here stops new sessions immediately. A token already issued to this browser stays valid until it expires, so close other tabs if you are on a shared machine.
// i18n settings.plus.account.title: Your account
// i18n settings.plus.checking: Checking…
// i18n settings.plus.checkingAccount: Checking your account…
// i18n settings.plus.checkout.cancelled: Checkout cancelled. Nothing was charged.
// i18n settings.plus.checkout.cta: Support Mawkingbird — ${{price}}/year
// i18n settings.plus.checkout.starting: Starting checkout…
// i18n settings.plus.checkout.thanks: Thank you for supporting Mawkingbird. Your account is set up.
// i18n settings.plus.diagnostics.byAccount: Saved collections by account
// i18n settings.plus.diagnostics.check: Check
// i18n settings.plus.diagnostics.comparison: Current account comparison
// i18n settings.plus.diagnostics.couldNotRead: Could not read
// i18n settings.plus.diagnostics.current: (current)
// i18n settings.plus.diagnostics.data: Data
// i18n settings.plus.diagnostics.intro: See everything your Mawkingbird Plus account stores, including collections kept separately for each Mastodon account. Nothing is changed by looking.
// i18n settings.plus.diagnostics.keysOpen: keys (
// i18n settings.plus.diagnostics.lastUpdated: Account last updated
// i18n settings.plus.diagnostics.lists: Lists
// i18n settings.plus.diagnostics.mastodonAccount: Mastodon account
// i18n settings.plus.diagnostics.matches: Everything matches.
// i18n settings.plus.diagnostics.noneFromAccount: Nothing saved from this account yet
// i18n settings.plus.diagnostics.noneSaved: No Mastodon account has saved collections to Plus yet.
// i18n settings.plus.diagnostics.nothingStored: Nothing stored
// i18n settings.plus.diagnostics.of: of
// i18n settings.plus.diagnostics.oneAccount.body: Settings are shared across it. Saved collections stay separated by Mastodon account so an alt never receives your main account's trust decisions, feeds or lists.
// i18n settings.plus.diagnostics.oneAccount: Mawkingbird Plus is one account.
// i18n settings.plus.diagnostics.reading: Reading your account…
// i18n settings.plus.diagnostics.retry: Try again
// i18n settings.plus.diagnostics.revision: , revision
// i18n settings.plus.diagnostics.rssFeeds: RSS feeds
// i18n settings.plus.diagnostics.savedFor: Saved for
// i18n settings.plus.diagnostics.settings: Settings
// i18n settings.plus.diagnostics.sharedSettings: Shared settings
// i18n settings.plus.diagnostics.storedAccounts.one: Plus currently holds saved collections for {{count}} account.
// i18n settings.plus.diagnostics.storedAccounts.other: Plus currently holds saved collections for {{count}} accounts.
// i18n settings.plus.diagnostics.syncAffects.after: . Collections saved for your other Mastodon accounts remain separate and unchanged.
// i18n settings.plus.diagnostics.syncAffects: Sync now affects
// i18n settings.plus.diagnostics.syncNow: Sync now
// i18n settings.plus.diagnostics.syncing: Syncing…
// i18n settings.plus.diagnostics.thisBrowser: This browser
// i18n settings.plus.diagnostics.title: Diagnostics
// i18n settings.plus.diagnostics.trusted: Trusted
// i18n settings.plus.diagnostics.using: Using
// i18n settings.plus.diagnostics.whatStored: What is stored
// i18n settings.plus.features.intro: Turn any of these off and back on whenever you like. Turning one off stops it syncing — nothing stored on your account is deleted.
// i18n settings.plus.features.title: What's switched on
// i18n settings.plus.intro.free: A free Mawkingbird account. It is optional and always will be — feeds, posting and the CORS proxy all work signed out, exactly as they do today.
// i18n settings.plus.intro.supporter: Thank you for supporting Mawkingbird. Here is what your subscription is doing.
// i18n settings.plus.offer.aYear: a year.
// i18n settings.plus.offer.buysTwoThings: A subscription buys two things: articles open here instead of in another tab, and everything you set up shows up on your other devices. The free column is what you keep either way.
// i18n settings.plus.offer.free: Free
// i18n settings.plus.offer.moreMayFollow: More may follow; none of it is promised. Anything already stored on your account stays readable and exportable whether or not you keep subscribing.
// i18n settings.plus.offer.plus: Plus
// i18n settings.plus.offer.seeExactly.after: — every limit, and what changes when you sign in.
// i18n settings.plus.offer.seeExactly: See exactly what free and Plus include
// i18n settings.plus.offer.staysFree: Mawkingbird itself stays free: every feed, timeline, list and post works without an account, and nothing you have made is taken away if you never subscribe or if you stop.
// i18n settings.plus.offer.stripeNote: Payment is handled by Stripe. This browser never sees your card details, and Mawkingbird stores nothing beyond which account is a supporter and when the year ends.
// i18n settings.plus.offer.title: Support Mawkingbird
// i18n settings.plus.offer.what: What
// i18n settings.plus.signin.emailLabel: Email address
// i18n settings.plus.signin.intro: Signing in is optional — Mawkingbird works without an account. What it adds is somewhere to keep what you set up, so it is waiting for you on your phone and your other computers instead of only here. Everything already in this browser stays here either way.
// i18n settings.plus.signin.linkSent: If that address can receive mail, a sign-in link is on its way. It expires in 15 minutes and can only be used once.
// i18n settings.plus.signin.noPassword: There is no password. Mawkingbird sends a one-time link instead, so there is nothing to remember and nothing for us to lose. Your address is used to identify the account and to send that link — nothing else.
// i18n settings.plus.signin.seeInclude: See what free and Plus each include.
// i18n settings.plus.signin.sendLink: Email me a sign-in link
// i18n settings.plus.signin.sending: Sending…
// i18n settings.plus.signin.title: Not signed in
// i18n settings.plus.title: Mawkingbird Plus
// i18n settings.plus.usage.checkAbove: Check above to include what your account holds.
// i18n settings.plus.usage.countedHere: — counted on this browser
// i18n settings.plus.usage.dailyLimit: Your daily reading limit
// i18n settings.plus.usage.fetchedAll: Times we fetched something for you, all devices
// i18n settings.plus.usage.fetchedHere: Times we fetched something for you, this browser
// i18n settings.plus.usage.keptOnAccount: kept on your account
// i18n settings.plus.usage.none: None
// i18n settings.plus.usage.openedToday: Of those, opened today
// i18n settings.plus.usage.resetsMidnight: — resets at midnight
// i18n settings.plus.usage.since: — since
// i18n settings.plus.vault.bytes: Encrypted bytes
// i18n settings.plus.vault.changePassphrase: Change passphrase
// i18n settings.plus.vault.checkTest: Check test vault
// i18n settings.plus.vault.close.hint: Forgets your passphrase here until you type it again. Your connections keep working; nothing is deleted and your other devices are unaffected. Worth doing on a shared computer.
// i18n settings.plus.vault.close: Close on this browser
// i18n settings.plus.vault.copyKeys.hint: Sends any connections saved only in this browser up, and brings down any saved only on your other devices. Nothing is overwritten.
// i18n settings.plus.vault.copyKeys: Copy keys to my other devices
// i18n settings.plus.vault.create: Create encrypted store
// i18n settings.plus.vault.creating: Creating…
// i18n settings.plus.vault.credentials.one: <strong>{{count}}</strong> connection credential is encrypted and available to your other devices.
// i18n settings.plus.vault.credentials.other: <strong>{{count}}</strong> connection credentials are encrypted and available to your other devices.
// i18n settings.plus.vault.delete: Delete the encrypted stored copy
// i18n settings.plus.vault.deleteAction: Delete encrypted stored copy
// i18n settings.plus.vault.deleteConfirm: Confirm: delete encrypted stored copy
// i18n settings.plus.vault.deployment: Deployment
// i18n settings.plus.vault.empty: The store is empty. Connect a supported low-churn service, or sync keys already in this browser.
// i18n settings.plus.vault.entitlement: Plus entitlement
// i18n settings.plus.vault.error.badSignIn: The profile Worker did not recognize this sign-in
// i18n settings.plus.vault.error.noPlus: The profile Worker did not recognize Plus
// i18n settings.plus.vault.error.notTester: The profile Worker did not recognize this account as a tester
// i18n settings.plus.vault.error.strongerSignIn: The Worker requires a stronger sign-in (unexpected on test)
// i18n settings.plus.vault.error.unreachable: The profile Worker or vault binding could not be reached
// i18n settings.plus.vault.expiry: Stored-copy expiry
// i18n settings.plus.vault.gettingTitle: What you are getting
// i18n settings.plus.vault.lockedNote: A stored copy exists, but its credential count and connector names are encrypted. Unlock it to see them — the server genuinely cannot.
// i18n settings.plus.vault.newPassphrase: New vault passphrase
// i18n settings.plus.vault.noExpiry: No expiry while subscribed
// i18n settings.plus.vault.noneStored: No connection credentials are stored yet.
// i18n settings.plus.vault.notRecognized: Not recognized — the switch stays disabled
// i18n settings.plus.vault.off: Off
// i18n settings.plus.vault.offHere: Off on this browser
// i18n settings.plus.vault.passphrase: Vault passphrase
// i18n settings.plus.vault.policy.age365: 365 days after it was created
// i18n settings.plus.vault.policy.age90: 90 days after it was created
// i18n settings.plus.vault.policy.idle365: After 365 days without use
// i18n settings.plus.vault.policy.idle90: After 90 days without use
// i18n settings.plus.vault.policy.never: Never while Plus remains active
// i18n settings.plus.vault.recognized: Recognized
// i18n settings.plus.vault.repeatPassphrase: Repeat passphrase
// i18n settings.plus.vault.retryDiagnostics: Retry diagnostics
// i18n settings.plus.vault.rolloutEnabled: Test rollout enabled
// i18n settings.plus.vault.state.locked: Found and locked on this browser
// i18n settings.plus.vault.state.open: Open and syncing
// i18n settings.plus.vault.state.ready: Ready, but no encrypted store has been created
// i18n settings.plus.vault.state.unchecked: Not checked yet
// i18n settings.plus.vault.store: Encrypted store
// i18n settings.plus.vault.storedFor: Stored for:
// i18n settings.plus.vault.syncSwitch: Sync switch
// i18n settings.plus.vault.testNote: Test deployment. Mawkingbird stores only ciphertext; your passphrase and decrypted keys stay in this browser.
// i18n settings.plus.vault.title: Encrypted connection keys
// i18n settings.plus.vault.tokenFreeNote: This test account is signed in, but its current token says Free. Refreshing the account or fixing the test subscription should change “Plus entitlement” above to Recognized.
// i18n settings.plus.vault.unlock: Unlock on this browser
// i18n settings.plus.vault.unlocking: Unlocking…
// i18n settings.plus.vault.whyTitle: Why it is or is not working

// i18n settings.plus.usage.gettingTitle: What you are getting

@Component({
  selector: 'app-settings-mawkingbird-plus',
  imports: [
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    PlusWelcomeDialog,
    AdoptionDialog,
  ],
  templateUrl: './settings-mawkingbird-plus.html',
  styleUrl: './settings-mawkingbird-plus.css',
})
export class SettingsMawkingbirdPlus implements OnInit {
  protected session = inject(MawkingbirdSession);
  private readonly transloco = inject(TranslocoService);
  protected plus = inject(PlusSession);
  private proxy = inject(CorsProxySettings);
  protected features = inject(PlusFeatures);
  /** Settings sync, as one on/off over `ProfileSync`'s five states. */
  protected settingsSync = inject(SettingsSyncToggle);
  protected diagnostics = inject(PlusDiagnostics);
  private sync = inject(ProfileSync);
  private proxyUsageStore = inject(CorsProxyUsageStore);
  protected articleQuota = inject(ArticleQuota);
  /** The account-wide article total, so a new laptop is not told 'zero'. */
  protected tally = inject(ArticleReadingTally);
  private log = inject(PageDiagnostics);
  private injector = inject(Injector);
  protected vault = inject(VaultService);
  protected vaultPreference = inject(VaultPreference);

  /** Proxy counters, local and account-wide. */
  private flags = inject(FeatureFlags);

  /**
   * What the subscription buys, from `plus-benefits.ts` rather than from prose.
   *
   * Filtered by flag so the page never advertises a capability this build has
   * switched off — the previous hand-written copy could not do that, and said
   * the proxy tier existed whether or not the proxy flag was on.
   */
  protected readonly benefits = computed(() =>
    visiblePlusBenefits((flag) => this.flags.enabled(flag)),
  );
  protected readonly priceUsd = PLUS_PRICE_USD_PER_YEAR;
  protected readonly freeDailyArticles = FREE_DAILY_ARTICLES;

  protected readonly proxyUsage = this.proxyUsageStore.usage;
  protected readonly formatBytes = formatBytes;
  protected readonly syncing = signal(false);
  protected readonly syncMessage = signal<string | null>(null);
  protected readonly vaultBusy = signal(false);
  protected readonly vaultMessage = signal<string | null>(null);
  protected readonly vaultPassphrase = signal('');
  protected readonly vaultPassphraseAgain = signal('');
  protected readonly vaultNextPassphrase = signal('');
  protected readonly vaultDeleteArmed = signal(false);
  private adoption = inject(CollectionAdoptionRunner);

  protected readonly vaultConnectors = computed(() =>
    this.vault.storedConnectors().map((id) => VAULT_CONNECTOR_LABELS[id] ?? id),
  );

  /**
   * The collection waiting on a merge-or-replace answer, if any.
   *
   * Held here rather than in the dialog so that backing out can put the toggle
   * back where it was — the dialog itself has no idea a toggle was involved.
   */
  protected readonly pendingAdoption = signal<{
    collection: AdoptableCollection;
    localCount: number;
    remoteCount: number;
  } | null>(null);

  /** A failure from the last adoption attempt, shown next to the toggles. */
  protected readonly adoptionError = signal('');

  /** Collections left to inspect after the current merge-or-replace question. */
  private adoptionQueue: AdoptableCollection[] = [];

  /**
   * Whether to show the one-time welcome dialog.
   *
   * Signed in, entitled, and never answered. Entitlement is part of it because
   * the dialog is about what a *subscription* switches on — showing it to a free
   * account would be an advert wearing a dialog's clothes.
   */
  protected readonly showWelcome = computed(
    () => this.session.user() !== null && this.plus.isSupporter() && !this.features.decided(),
  );

  /** The toggles, mirrored here so a decision can always be revisited. */
  /**
   * The toggle list, with settings sync spliced in as a live row.
   *
   * Settings sync is **not** a stored preference — it is a view of
   * `ProfileSync`, which is the only thing that decides whether anything
   * uploads. It used to be both, and the two disagreed: a stored
   * `settingsSync: true` showed the toggle on while sync sat at `unasked`,
   * so this page said "enabled" while the Config page correctly said "off".
   *
   * Rendered first because it is the one people look for, and because the rest
   * of the list is about *what* syncs while this one is about *whether*.
   */
  protected readonly featureRows = computed<FeatureRow[]>(() => [
    {
      feature: 'settingsSync' as const,
      on: this.settingsSync.on(),
      label: 'Settings sync',
    },
    ...this.features
      .all()
      .filter((row) => row.feature !== 'apiKeys')
      .map((row) => ({ ...row, label: FEATURE_LABELS[row.feature] })),
  ]);

  protected async setFeature(feature: ToggleId, on: boolean): Promise<void> {
    this.adoptionError.set('');

    if (feature === 'settingsSync') {
      // Straight through to ProfileSync. Nothing is stored here, so there is no
      // second copy of this answer to fall out of step.
      //
      // Logged on both sides of the call: this toggle decides whether anything
      // syncs at all, and "I clicked it and nothing happened" needs to be
      // answerable from a console paste.
      const before = this.settingsSync.detail();
      this.log.info('PlusPage', 'settings-sync:set', { on, before });
      const failure = await this.settingsSync.set(on);
      this.log.info('PlusPage', 'settings-sync:done', {
        on,
        before,
        after: this.settingsSync.detail(),
        syncing: this.settingsSync.on(),
        failure,
      });
      // Shown, not just logged. Turning sync on can be refused by the service,
      // and a toggle that quietly returns to off tells the user nothing about
      // why — which is exactly how a stale-token 402 stayed invisible.
      if (failure) {
        this.adoptionError.set(failure);
      }
      return;
    }

    this.features.set(feature, on);

    if (feature === 'corsProxy' && on && this.proxy.missingEntitledProxy()) {
      this.proxy.adoptSupporterProxy();
      return;
    }

    // Turning a collection *off* is just a setting: nothing is uploaded and
    // nothing stored is deleted, so there is nothing to reconcile.
    const collection = COLLECTION_FOR[feature];
    if (!collection || !on) {
      return;
    }

    const inspection = await this.adoption.inspect(collection);
    if (inspection.error) {
      // Put the toggle back: claiming a collection is syncing when the first
      // read failed is the lie that makes people trust a sync that is not
      // running.
      this.features.set(feature, false);
      this.adoptionError.set(inspection.error);
      return;
    }
    if (inspection.needsChoice) {
      this.pendingAdoption.set({
        collection: inspection.collection,
        localCount: inspection.localCount,
        remoteCount: inspection.remoteCount,
      });
    }
  }

  protected async resolveAdoption(choice: AdoptionChoice): Promise<void> {
    const pending = this.pendingAdoption();
    if (!pending) {
      return;
    }
    const ok = await this.adoption.apply(pending.collection, choice);
    this.pendingAdoption.set(null);
    if (!ok) {
      this.features.set(FEATURE_FOR[pending.collection], false);
      this.adoptionError.set('That could not be saved to your account. Nothing was changed.');
      this.adoptionQueue = [];
      return;
    }
    await this.continueCollectionReconciliation();
  }

  /** Backed out of the question: the toggle goes back off, nothing is touched. */
  protected async cancelAdoption(): Promise<void> {
    const pending = this.pendingAdoption();
    if (pending) {
      this.features.set(FEATURE_FOR[pending.collection], false);
    }
    this.pendingAdoption.set(null);
    await this.continueCollectionReconciliation();
  }

  /**
   * The welcome dialog records the choices; this performs their network side.
   *
   * Without this hand-off, the default-on collection switches were persisted
   * as though they were active but their first adoption never ran. Since the
   * switches were already on, there was no later off-to-on transition to run it.
   */
  protected async welcomeSaved(): Promise<void> {
    this.features.refresh();
    this.adoptionError.set('');
    if (
      this.vaultPreference.available &&
      this.plus.isSupporter() &&
      this.vaultPreference.enabled()
    ) {
      await this.refreshVault();
    }
    const result = await this.reconcileCollections(this.enabledCollections(), true);
    if (result.errors.length > 0) {
      this.adoptionError.set(result.errors.join(' '));
    }
  }

  /** What the user typed into the email field. */
  protected readonly email = signal('');

  /**
   * True once a link has been sent.
   *
   * Drives the "check your inbox" message. Note what it deliberately does
   * *not* mean: that an account exists. The service answers identically for a
   * known and an unknown address, so the UI must never imply the address was
   * recognised — that would reintroduce the enumeration oracle the endpoint
   * goes out of its way to avoid.
   */
  protected readonly linkSent = signal(false);

  /**
   * Set when this page was reached by returning from Stripe.
   *
   * Read once in `ngOnInit` rather than from a router signal, because the value
   * is a one-shot fact about how the page was entered — leaving it in the URL
   * would make a refresh re-congratulate the user.
   */
  protected readonly checkoutOutcome = signal<'success' | 'cancel' | null>(null);

  async ngOnInit(): Promise<void> {
    const returningFromCheckout = new URLSearchParams(location.search).has('checkout');
    authDebug('page:init', { returningFromCheckout });

    await this.session.ensureReady();

    authDebug('page:after-ensureReady', {
      returningFromCheckout,
      signedIn: this.session.user() !== null,
      error: this.session.error(),
    });

    const outcome = new URLSearchParams(location.search).get('checkout');
    if (outcome === 'success' || outcome === 'cancel') {
      this.checkoutOutcome.set(outcome);
      // Strip the parameter so a reload does not repeat the message.
      const clean = new URL(location.href);
      clean.searchParams.delete('checkout');
      history.replaceState({}, '', clean);
    }

    if (this.session.user()) {
      authDebug('page:refreshing-tier');
      // A fresh mint rather than a cached one: on a checkout return the
      // entitlement was written seconds ago, and a stale token would show the
      // old tier for up to fifteen minutes.
      await this.plus.refresh();
      // After the tier is settled, because a supporter is the only account with
      // a server-side total to fetch. Not awaited into the vault work below —
      // this is one number on one panel, and it must not delay the rest of the
      // page if the profile service is slow.
      void this.tally.load();
      if (
        this.vaultPreference.available &&
        this.plus.isSupporter() &&
        this.vaultPreference.enabled()
      ) {
        await this.refreshVault();
        if (this.vault.unlocked()) {
          await this.syncExistingVaultKeys();
        }
      }
    }
  }

  protected async sendLink(): Promise<void> {
    const address = this.email().trim();
    if (!address) {
      return;
    }
    const accepted = await this.session.requestSignInLink(address);
    // Only on acceptance, so a rate-limit or network failure shows the error
    // rather than a "check your inbox" for mail that was never sent.
    this.linkSent.set(accepted);
  }

  protected async signOut(): Promise<void> {
    void this.vault.lock();
    this.plus.clear();
    await this.session.signOut();
    // `signOut()` clears the stored record; this re-reads it, so the next
    // account gets the dialog rather than inheriting this one's answer.
    this.features.refresh();
    this.linkSent.set(false);
    this.email.set('');
  }

  /** Turn connection-key sync on for this account in test, or stop it locally. */
  protected async setVaultEnabled(on: boolean): Promise<void> {
    if (!this.vaultPreference.available || (on && !this.plus.isSupporter())) {
      return;
    }
    this.vaultPreference.set(on);
    this.vaultMessage.set(null);
    this.vaultDeleteArmed.set(false);
    if (!on) {
      await this.vault.lock();
      this.vaultMessage.set(
        'Connection-key sync is off on this browser. The encrypted stored copy was not deleted.',
      );
      return;
    }
    await this.refreshVault();
    if (this.vault.unlocked()) {
      await this.syncExistingVaultKeys();
    }
  }

  /** Re-check the remote state; this is also the diagnostics retry button. */
  protected async refreshVault(): Promise<void> {
    if (!this.vaultPreference.available || !this.vaultPreference.enabled()) {
      return;
    }
    this.vaultBusy.set(true);
    this.vaultMessage.set(null);
    try {
      await this.vault.refresh();
    } finally {
      this.vaultBusy.set(false);
    }
  }

  /** Create the encrypted store, then import eligible keys already in this browser. */
  protected async createVault(): Promise<void> {
    if (this.vaultPassphrase() !== this.vaultPassphraseAgain()) {
      this.vaultMessage.set('The two passphrases do not match.');
      return;
    }
    this.vaultBusy.set(true);
    this.vaultMessage.set(null);
    try {
      const problem = await this.vault.create(this.vaultPassphrase());
      if (problem) {
        this.vaultMessage.set(problem);
        return;
      }
      this.vaultPassphrase.set('');
      this.vaultPassphraseAgain.set('');
      await this.syncExistingVaultKeys();
    } finally {
      this.vaultBusy.set(false);
    }
  }

  protected async unlockVault(): Promise<void> {
    this.vaultBusy.set(true);
    this.vaultMessage.set(null);
    try {
      const opened = await this.vault.unlock(this.vaultPassphrase());
      if (opened) {
        this.vaultPassphrase.set('');
        await this.syncExistingVaultKeys();
      } else {
        this.vaultMessage.set(
          this.vault.notice() ??
            this.transloco.translate<string>('settings.plus.vault.wrongPassphrase'),
        );
      }
    } finally {
      this.vaultBusy.set(false);
    }
  }

  protected async lockVault(): Promise<void> {
    await this.vault.lock();
    this.vaultMessage.set(
      'Closed on this browser. Your saved connections are untouched — type your passphrase to open them here again.',
    );
  }

  /** Reconcile low-churn credentials in both directions, with empty losing to present. */
  protected async syncExistingVaultKeys(): Promise<void> {
    if (!this.vault.unlocked() || !this.vaultPreference.enabled()) {
      this.vaultMessage.set('Unlock stored connections before syncing keys from this browser.');
      return;
    }
    this.vaultBusy.set(true);
    try {
      const result = await this.injector.get(VaultAdoption).reconcileExisting();
      const messages: string[] = [`Opened ${this.vault.count()} stored connection credential(s).`];
      if (result.restored.length > 0) {
        messages.push(`Restored to this browser: ${result.restored.join(', ')}.`);
      }
      if (result.stored.length > 0) {
        messages.push(`Stored from this browser: ${result.stored.join(', ')}.`);
      }
      if (result.merged.length > 0) {
        messages.push(`Safely merged missing data for: ${result.merged.join(', ')}.`);
      }
      if (result.conflicts.length > 0) {
        messages.push(
          `Left conflicting non-empty copies unchanged for ${result.conflicts
            .map((failure) => failure.connector)
            .join(', ')}.`,
        );
      }
      if (result.failed.length > 0) {
        messages.push(
          `Could not store ${result.failed.map((failure) => failure.connector).join(', ')}: ${result.failed
            .map((failure) => failure.message)
            .join(' ')}`,
        );
      }
      if (
        result.restored.length === 0 &&
        result.stored.length === 0 &&
        result.merged.length === 0 &&
        result.conflicts.length === 0 &&
        result.failed.length === 0
      ) {
        messages.push('This browser and the encrypted copy are already reconciled.');
      }
      this.vaultMessage.set(messages.join(' '));
    } finally {
      this.vaultBusy.set(false);
    }
  }

  protected async changeVaultPassphrase(): Promise<void> {
    this.vaultBusy.set(true);
    this.vaultMessage.set(null);
    try {
      const problem = await this.vault.changePassphrase(this.vaultNextPassphrase());
      this.vaultMessage.set(
        problem ?? this.transloco.translate<string>('settings.plus.vault.passphraseChanged'),
      );
      if (!problem) {
        this.vaultNextPassphrase.set('');
      }
    } finally {
      this.vaultBusy.set(false);
    }
  }

  protected async setVaultPolicy(value: string): Promise<void> {
    const policy = VAULT_POLICIES[value];
    if (!policy) {
      return;
    }
    this.vaultBusy.set(true);
    try {
      const result = await this.vault.setPolicy(policy);
      this.vaultMessage.set(result ? 'Stored-copy retention updated.' : this.vault.notice());
    } finally {
      this.vaultBusy.set(false);
    }
  }

  protected vaultPolicyValue(): string {
    const policy = this.vault.meta()?.policy;
    if (!policy) {
      return 'idle-90';
    }
    return policy.kind === 'never' ? 'never' : `${policy.kind}-${policy.days}`;
  }

  protected async destroyVault(): Promise<void> {
    if (!this.vaultDeleteArmed()) {
      this.vaultDeleteArmed.set(true);
      return;
    }
    this.vaultBusy.set(true);
    try {
      const destroyed = await this.vault.destroy();
      this.vaultMessage.set(
        destroyed
          ? 'The encrypted stored copy was deleted. Connector keys in this browser were not changed.'
          : this.vault.notice(),
      );
      this.vaultDeleteArmed.set(false);
    } finally {
      this.vaultBusy.set(false);
    }
  }

  /** Read local and remote state. Changes nothing — see `plus-diagnostics.ts`. */
  protected async loadDiagnostics(): Promise<void> {
    this.syncMessage.set(null);
    await this.diagnostics.load();
  }

  /**
   * Why the sync button is unavailable, or null when it is fine.
   *
   * Shown next to the button rather than left for the click to reveal. "Sync
   * now" that reports "settings sync is off" only after being pressed is a
   * button that looks broken — the reason was knowable before the press.
   */
  protected syncBlockedReason(): string | null {
    if (!this.settingsSync.on() && this.enabledCollections().length === 0) {
      return 'All sync features are off. Turn on at least one above and this will start working.';
    }
    if (this.sync.readOnly()) {
      // Not "your subscription has lapsed": this state is reached by anyone
      // without an active subscription, which includes everyone who never had
      // one. Telling them something of theirs ran out is an accusation about an
      // event that did not happen.
      return 'Settings are not being saved to your account, because storing them there is part of Mawkingbird Plus.';
    }
    return null;
  }

  /**
   * Push this browser's settings and enabled collections, then re-read.
   *
   * Interactive, so a failure is reported now rather than counted towards a
   * later warning — the user is watching a button they just pressed.
   */
  protected async syncNow(): Promise<void> {
    this.syncing.set(true);
    this.syncMessage.set(null);
    this.log.info('PlusPage', 'sync-now:start', {
      syncState: this.sync.record().state,
      syncing: this.sync.syncing(),
      dirty: this.sync.record().dirty === true,
    });
    try {
      const outcome = await this.sync.push(true);
      this.log.info('PlusPage', 'sync-now:outcome', { kind: outcome.kind });
      const messages: string[] = [];
      switch (outcome.kind) {
        case 'saved':
          messages.push(`Uploaded ${outcome.keys} setting(s) as revision ${outcome.revision}.`);
          break;
        case 'not-syncing':
          messages.push('Settings sync is off. Turn it on above first.');
          break;
        case 'conflict':
          messages.push('Your account changed first. Check again to see what it holds.');
          break;
        default:
          messages.push(outcome.message);
      }

      const collections = await this.reconcileCollections(this.enabledCollections(), false);
      if (collections.synced.length > 0) {
        messages.push(
          `Synced ${collections.synced.map((collection) => COLLECTION_LABELS[collection]).join(', ')}.`,
        );
      }
      if (collections.pending) {
        messages.push(`Choose how to reconcile ${COLLECTION_LABELS[collections.pending]}.`);
      }
      if (collections.errors.length > 0) {
        messages.push(collections.errors.join(' '));
      }
      this.syncMessage.set(messages.join(' '));
      await this.diagnostics.load();
    } finally {
      this.syncing.set(false);
    }
  }

  /** Collections whose saved Plus choices say they belong on the account. */
  private enabledCollections(): AdoptableCollection[] {
    return (Object.keys(FEATURE_FOR) as AdoptableCollection[]).filter((collection) =>
      this.features.isOn(FEATURE_FOR[collection]),
    );
  }

  /**
   * Settle each enabled collection until one needs a user decision.
   *
   * The remaining work is queued because only one adoption dialog can be on
   * screen at a time. Resolving or cancelling that dialog resumes the queue.
   */
  private async reconcileCollections(
    collections: AdoptableCollection[],
    disableOnFailure: boolean,
  ): Promise<CollectionReconciliation> {
    this.adoptionQueue = [];
    const synced: AdoptableCollection[] = [];
    const errors: string[] = [];

    for (const [index, collection] of collections.entries()) {
      const inspection = await this.adoption.inspect(collection);
      if (inspection.error) {
        if (disableOnFailure) {
          this.features.set(FEATURE_FOR[collection], false);
        }
        errors.push(`${COLLECTION_LABELS[collection]}: ${inspection.error}`);
        continue;
      }
      if (inspection.needsChoice) {
        this.adoptionQueue = collections.slice(index + 1);
        this.pendingAdoption.set({
          collection: inspection.collection,
          localCount: inspection.localCount,
          remoteCount: inspection.remoteCount,
        });
        return { synced, errors, pending: collection };
      }
      synced.push(collection);
    }

    return { synced, errors, pending: null };
  }

  /** Continue work that was paused behind an adoption dialog. */
  private async continueCollectionReconciliation(): Promise<void> {
    const remaining = this.adoptionQueue;
    this.adoptionQueue = [];
    if (remaining.length === 0) {
      return;
    }
    const result = await this.reconcileCollections(remaining, true);
    if (result.errors.length > 0) {
      this.adoptionError.set(result.errors.join(' '));
    }
  }
}

/**
 * What a toggle can govern.
 *
 * `settingsSync` is not a {@link PlusFeature} — it has no stored preference and
 * lives entirely in `ProfileSync`. It is a toggle on this page and nothing else,
 * which is exactly what this type says.
 */
type ToggleId = PlusFeature | 'settingsSync';

interface FeatureRow {
  feature: ToggleId;
  on: boolean;
  label: string;
}

interface CollectionReconciliation {
  synced: AdoptableCollection[];
  errors: string[];
  pending: AdoptableCollection | null;
}

const FEATURE_LABELS: Record<PlusFeature, string> = {
  corsProxy: 'Mawkingbird CORS proxy',
  trustSync: 'Trusted accounts',
  listsSync: 'Client lists',
  feedsSync: 'RSS subscription list',
  apiKeys: 'Encrypted connection keys',
};

/** Which collection a toggle governs. Toggles with no collection sync nothing. */
const COLLECTION_FOR: Partial<Record<PlusFeature, AdoptableCollection>> = {
  trustSync: 'trust',
  feedsSync: 'feeds',
  listsSync: 'lists',
};

const FEATURE_FOR: Record<AdoptableCollection, PlusFeature> = {
  trust: 'trustSync',
  feeds: 'feedsSync',
  lists: 'listsSync',
};

const COLLECTION_LABELS: Record<AdoptableCollection, string> = {
  trust: 'trusted accounts',
  feeds: 'RSS subscriptions',
  lists: 'client lists',
};

const VAULT_CONNECTOR_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter',
  'cors-proxy': 'CORS proxy',
  'link-shortener': 'Link shorteners',
  raindrop: 'Raindrop',
  twitter: 'Twitter',
  mataroa: 'Mataroa',
  hugo: 'Hugo',
  github: 'GitHub',
  gist: 'GitHub Gist',
};

const VAULT_POLICIES: Record<
  string,
  import('../../../providers/vault/vault-client').VaultMeta['policy']
> = {
  'idle-90': { kind: 'idle', days: 90 },
  'idle-365': { kind: 'idle', days: 365 },
  'absolute-90': { kind: 'absolute', days: 90 },
  'absolute-365': { kind: 'absolute', days: 365 },
  never: { kind: 'never' },
};
