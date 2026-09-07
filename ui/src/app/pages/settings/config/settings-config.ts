import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfigSync, ConfigSyncFrequency, RemoteConfigResult } from '../../../config-sync';
import { PasteHistory } from '../../../providers/paste/paste-history';
import { ProfileSync } from '../../../providers/account/profile-sync';
import type { PushOutcome } from '../../../providers/account/profile-sync';
import { SupporterStatus } from '../../../providers/account/supporter-status';
import { formatBytes } from '../../../observability/local-storage-inspector';
import { PageDiagnostics } from '../../../page-diagnostics';
import {
  configChanges,
  ConfigChange,
  exportPortableConfig,
  importPortableConfig,
  parsePortableConfig,
  PortableConfig,
} from '../../../portable-config';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.config.title: Import/Export Config
// i18n settings.config.intro: Move browser settings between devices or keep them synced from a URL.
// i18n settings.config.sync: Mawkingbird Plus sync
// i18n settings.config.sync.offer: Keep these settings on your Mawkingbird account so they follow you to your other browsers.
// i18n settings.config.sync.thisBrowser: this browser's
// i18n settings.config.sync.offer.hint.before: Turning this on uploads
// i18n settings.config.sync.offer.hint.after: settings and makes them your profile. Your other browsers will take these settings the next time you use them, so it's worth a look first if this isn't the browser you set up on.
// i18n settings.config.sync.turnOn: Turn on sync
// i18n settings.config.sync.showUpload: Show what would be uploaded
// i18n settings.config.sync.noThanks: No thanks
// i18n settings.config.sync.wouldSave: This browser would save:
// i18n settings.config.sync.remoteExists: Your account has settings synced from another browser.
// i18n settings.config.sync.useRemote: Use them on this browser
// i18n settings.config.sync.notHere: Not on this browser
// i18n settings.config.sync.turningOn: Turning on…
// i18n settings.config.sync.resume: Turn sync back on
// i18n settings.config.sync.resume.hint: Your account's settings are taken first, so this browser matches your others. If this browser has changes your account doesn't, you'll be asked which to keep.
// i18n settings.config.sync.syncing: Syncing…
// i18n settings.config.sync.syncNow: Sync now
// i18n settings.config.sync.stop: Stop syncing
// i18n settings.config.sync.stop.hint: Stopping keeps everything as it is — nothing is deleted, and you can turn it back on.
// i18n settings.config.sync.offNever: Not syncing on this browser.
// i18n settings.config.sync.offSince: Not syncing on this browser — last saved {{when}}.
// i18n settings.config.sync.onNothing: Syncing — nothing saved yet.
// i18n settings.config.sync.onSince: Syncing — last saved {{when}}.
// i18n settings.config.conflict.aria: Settings conflict
// i18n settings.config.remoteStable: Remote configuration fetched twice and verified stable.
// i18n settings.config.syncOff: Sync is off on this browser.
// i18n settings.config.conflict: Your settings changed on another device, and this browser also has unsaved changes.
// i18n settings.config.conflict.differ: These preferences differ:
// i18n settings.config.conflict.useOther: Use the other device's
// i18n settings.config.conflict.keepLocal: Keep this browser's
// i18n settings.config.conflict.later: Decide later
// i18n settings.config.change.add: Added
// i18n settings.config.change.change: Changed
// i18n settings.config.change.remove: Removed
// i18n settings.config.readOnly: Settings are no longer being saved to your account, because storing them there is part of Mawkingbird Plus. Everything already stored stays readable and can be exported at any time.
// i18n settings.config.savedFrom: Saved from this browser:
// i18n settings.config.export: Export
// i18n settings.config.includePrivate: Include potentially private settings
// i18n settings.config.includePrivate.hint: Adds your home server, custom CORS proxy address, and branded link-shortener setup. Never includes credentials, account-scoped settings, follows, blocks or mutes, RSS or paste feeds, lists, bookmarks, saved searches, local moderation, activity history, drafts, or authored content.
// i18n settings.config.previewJson: Preview JSON
// i18n settings.config.downloadJson: Download JSON
// i18n settings.config.copyJson: Copy JSON
// i18n settings.config.previewPublish: Preview Pastepile publish
// i18n settings.config.ok: ✓ {{message}}
// i18n settings.config.export.hint: Every export is checked at runtime against the storage registry and the credentials currently stored in this browser. Pastepile publishing is anonymous and deliberately omits your Pastepile API key so its permanent-paste option remains available.
// i18n settings.config.openPublished: Open published config
// i18n settings.config.managePastes: Manage in My Pastes
// i18n settings.config.publishPreview: Publish preview
// i18n settings.config.exportPreview: Export preview
// i18n settings.config.closeLower: close
// i18n settings.config.jsonPreview.aria: Export JSON preview
// i18n settings.config.publish.hint: This creates a permanent, unlisted Pastepile. Its edit password will be kept only in this browser and the paste will appear under My Pastes for later editing or deletion.
// i18n settings.config.publishing: Publishing…
// i18n settings.config.publishNow: Publish this preview
// i18n settings.config.importFile: Import file
// i18n settings.config.pastePlaceholder: …or paste Mawkingbird config JSON here
// i18n settings.config.previewPasted: Preview pasted config
// i18n settings.config.remoteUrl: Remote URL
// i18n settings.config.remoteUrlPlaceholder: https://example.com/mockingbird-config.json
// i18n settings.config.checking: Checking…
// i18n settings.config.checkNow: Check now
// i18n settings.config.freq.manual: On demand only
// i18n settings.config.freq.daily: Daily
// i18n settings.config.freq.weekly: Weekly
// i18n settings.config.saveSource: Save source
// i18n settings.config.removeSource: remove
// i18n settings.config.remote.hint: Automatic checks compare the remote file's SHA-256 hash and ignore local UI changes. A changed remote file prompts before import. Every remote response is immediately fetched again; a source that cannot return the same hash twice is limited to on-demand checks.
// i18n settings.config.importPreview: Import preview
// i18n settings.config.schemaLine: Schema {{schema}} · {{privacy}} profile · exported {{exported}}
// i18n settings.config.privacy.private: potentially private
// i18n settings.config.privacy.standard: standard
// i18n settings.config.noChanges: No settings would change.
// i18n settings.config.importReload: Import and reload
@Component({
  selector: 'app-settings-config',
  imports: [FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './settings-config.html',
  styleUrl: './settings-config.css',
})
export class SettingsConfig {
  protected readonly sync = inject(ConfigSync);
  private readonly pasteHistory = inject(PasteHistory);

  /**
   * Mawkingbird Plus settings sync.
   *
   * Sits alongside the URL-based `ConfigSync` above rather than replacing it.
   * The two answer different needs and both are legitimate: a published URL is
   * how you hand your setup to somebody else or keep a fleet of machines on one
   * config you edit by hand, while this is your own account following you
   * between your own browsers. Someone can reasonably use either, or neither.
   */
  protected readonly profile = inject(ProfileSync);
  private readonly supporter = inject(SupporterStatus);
  private readonly diagnostics = inject(PageDiagnostics);

  /** The upload preview shown before enabling sync for the first time. */
  protected readonly syncPreview = signal<ConfigChange[] | null>(null);
  /** A remote document waiting on a keep-mine-or-take-theirs decision. */
  protected readonly syncDecision = signal<{
    remote: PortableConfig;
    changes: ConfigChange[];
    etag: string;
    revision: number;
  } | null>(null);
  protected readonly syncMessage = signal('');
  /**
   * A sync failure, kept apart from {@link syncMessage}.
   *
   * Separate signals because they are separate things: a status update and a
   * failure should not be able to occupy the same slot, which is how "Saved
   * this browser's settings." came to be shown for an upload that never landed.
   */
  protected readonly syncError = signal('');
  /** What the last successful upload contained, in user-facing language. */
  protected readonly syncUploaded = signal<SyncedPreference[] | null>(null);

  /** Whether to offer turning sync on. Entitlement is read, never assumed. */
  protected readonly offersSync = computed(() =>
    this.profile.offersSync(this.supporter.isSupporter()),
  );
  protected readonly offersRemote = computed(() => this.profile.offersRemote());
  /**
   * Whether to offer turning sync back on.
   *
   * The branch that used to have no controls at all: a browser that had stopped
   * syncing, or declined once, rendered a status line and nothing else.
   */
  protected readonly offersResume = computed(() =>
    this.profile.offersResume(this.supporter.isSupporter()),
  );

  /**
   * The one sync failure to show, from either source.
   *
   * `syncError` is what this page observed from an action the user took;
   * `profile.error()` is what the service last reported. They are usually the
   * same sentence for the same cause — a 402 sets both — and rendering them in
   * two slots stacked the identical message twice.
   *
   * Deduplicated by value rather than by picking a winner, so a genuinely
   * different pair still shows both, separated.
   */
  protected readonly syncFailure = computed(() => {
    const mine = this.syncError();
    const service = this.profile.error() ?? '';
    if (mine && service && mine !== service) {
      return `${mine} ${service}`;
    }
    return mine || service;
  });

  /**
   * A human sentence for the sync state.
   *
   * Deliberately says *when*, not just *whether*. "On" with no timestamp is the
   * shape of a feature that silently stopped working three weeks ago.
   */
  private transloco = inject(TranslocoService);

  protected syncSummaryLine(): string {
    const record = this.profile.record();
    if (record.state !== 'on') {
      // Says what is stored, not just that nothing is happening. "Not syncing"
      // alone reads as a dead end, which is how this looked when the state had
      // no way out.
      return record.lastSyncedAt === undefined
        ? this.transloco.translate<string>('settings.config.sync.offNever')
        : this.transloco.translate<string>('settings.config.sync.offSince', {
            when: new Date(record.lastSyncedAt).toLocaleString(),
          });
    }
    const at = record.lastSyncedAt;
    if (at === undefined) {
      return this.transloco.translate<string>('settings.config.sync.onNothing');
    }
    return this.transloco.translate<string>('settings.config.sync.onSince', {
      when: new Date(at).toLocaleString(),
    });
  }

  /** Translation key naming the preference an internal storage key represents. */
  protected configKeyLabelKey(key: string): string {
    return CONFIG_KEY_LABELS[key] ?? 'settings.config.key.other';
  }

  /** A config diff action as a translation key rather than an enum. */
  protected configChangeKey(action: ConfigChange['action']): string {
    switch (action) {
      case 'add':
        return 'settings.config.change.add';
      case 'change':
        return 'settings.config.change.change';
      case 'remove':
        return 'settings.config.change.remove';
    }
  }

  protected readonly includePrivate = signal(false);
  protected readonly importText = signal('');
  protected readonly remoteUrl = signal(this.sync.settings()?.url ?? '');
  protected readonly frequency = signal<ConfigSyncFrequency>(
    this.sync.settings()?.frequency ?? 'manual',
  );
  protected readonly preview = signal<PortableConfig | null>(null);
  protected readonly changes = signal<ConfigChange[]>([]);
  protected readonly remoteResult = signal<RemoteConfigResult | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly publishedUrl = signal('');
  protected readonly exportPreview = signal('');
  protected readonly publishPrepared = signal(false);
  protected readonly exportMessage = signal('');

  protected exportText(): string {
    return JSON.stringify(exportPortableConfig(localStorage, this.includePrivate()), null, 2);
  }

  protected download(): void {
    this.clearNotice();
    try {
      const blob = new Blob([this.exportText()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mockingbird-config-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.exportMessage.set('Configuration downloaded.');
    } catch (error: unknown) {
      this.diagnostics.error('Config', 'download:error', error);
      this.showError(error);
    }
  }

  protected async copy(): Promise<void> {
    this.clearNotice();
    try {
      await navigator.clipboard.writeText(this.exportText());
      this.exportMessage.set('Configuration copied to the clipboard.');
    } catch (error: unknown) {
      this.diagnostics.error('Config', 'clipboard:error', error);
      this.showError(error);
    }
  }

  protected previewExport(forPublish = false): void {
    this.clearNotice();
    this.exportPreview.set(this.exportText());
    this.publishPrepared.set(forPublish);
    this.exportMessage.set(
      forPublish
        ? 'Review this exact JSON before creating the paste.'
        : 'Export preview generated. Nothing was downloaded, copied, or published.',
    );
  }

  protected closeExportPreview(): void {
    this.exportPreview.set('');
    this.publishPrepared.set(false);
  }

  protected async publish(): Promise<void> {
    const content = this.exportPreview();
    if (!this.publishPrepared() || !content) {
      this.previewExport(true);
      return;
    }
    this.clearNotice();
    this.busy.set(true);
    try {
      const created = await this.sync.publishPermanent(content);
      this.pasteHistory.add(
        'pastepile',
        'Pastepile',
        {
          title: 'Mockingbird client configuration',
          content,
          language: 'json',
          expiry: 'never',
          visibility: 'unlisted',
        },
        created,
      );
      this.publishedUrl.set(created.url);
      this.remoteUrl.set(created.rawUrl);
      this.exportMessage.set('Published and saved in My Pastes with its edit password.');
      const result = await this.sync.fetchStable(created.rawUrl);
      this.remoteResult.set(result);
      this.previewConfig(result.config);
      this.message.set('Permanent unlisted Pastepile created and verified.');
      this.publishPrepared.set(false);
    } catch (error: unknown) {
      this.diagnostics.error('Config', 'publish:error', error);
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected previewPasted(): void {
    this.clearNotice();
    this.remoteResult.set(null);
    try {
      this.previewConfig(parsePortableConfig(this.importText()));
    } catch (error: unknown) {
      this.diagnostics.warn('Config', 'import:parse-error', {
        reason: error instanceof Error ? error.message : String(error),
      });
      this.preview.set(null);
      this.changes.set([]);
      this.showError(error);
    }
  }

  protected async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    this.importText.set(await file.text());
    this.previewPasted();
  }

  protected async loadUrl(): Promise<void> {
    this.clearNotice();
    this.busy.set(true);
    try {
      const result = await this.sync.fetchStable(this.remoteUrl().trim());
      this.remoteResult.set(result);
      this.previewConfig(result.config);
      this.message.set(
        result.warning ?? this.transloco.translate<string>('settings.config.remoteStable'),
      );
    } catch (error: unknown) {
      this.diagnostics.error('Config', 'remote:fetch-error', error);
      this.remoteResult.set(null);
      this.preview.set(null);
      this.changes.set([]);
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected apply(): void {
    const config = this.preview();
    if (!config) {
      return;
    }
    const count = this.changes().length;
    if (
      !confirm(
        `Import this configuration and reload? ${count} setting${count === 1 ? '' : 's'} will change. Missing settings covered by the file are reset.`,
      )
    ) {
      return;
    }
    importPortableConfig(config, localStorage);
    const remote = this.remoteResult();
    if (remote && this.remoteUrl().trim()) {
      this.sync.configure(this.remoteUrl().trim(), this.frequency(), remote);
    }
    location.reload();
  }

  protected saveSource(): void {
    const result = this.remoteResult();
    const url = this.remoteUrl().trim();
    if (!result || !url) {
      return;
    }
    this.sync.configure(url, this.frequency(), result);
    const saved = this.sync.settings();
    this.frequency.set(saved?.frequency ?? 'manual');
    this.message.set(
      result.stable
        ? 'Remote source saved.'
        : 'Source saved for on-demand checks only because it could not be verified as stable.',
    );
  }

  protected clearSource(): void {
    this.sync.clear();
    this.remoteUrl.set('');
    this.remoteResult.set(null);
    this.frequency.set('manual');
    this.message.set('Remote source removed.');
  }

  protected syncSummary(): string {
    const saved = this.sync.settings();
    if (!saved) {
      return 'No remote source saved.';
    }
    const checked = saved.lastCheckedAt ? new Date(saved.lastCheckedAt).toLocaleString() : 'never';
    return `${saved.frequency === 'manual' ? 'On demand' : saved.frequency} · last checked ${checked}`;
  }

  // --- Mawkingbird Plus settings sync -------------------------------------

  /**
   * Show what turning sync on would upload, before it uploads anything.
   *
   * Worth a click of its own because the first push defines the baseline every
   * other browser inherits. "Show me first" costs nothing here — the diff is
   * the same `configChanges()` the import preview already uses.
   */
  protected previewSyncUpload(): void {
    this.clearNotice();
    const upload = this.profile.previewUpload();
    // Against an empty store, so this reads as "what would be uploaded" rather
    // than "what would change", which is the question being asked.
    this.syncPreview.set(
      Object.keys(upload.values).map((key) => ({ key, action: 'add' as const })),
    );
  }

  protected cancelSyncPreview(): void {
    this.syncPreview.set(null);
  }

  protected async enableSync(): Promise<void> {
    this.clearNotice();
    this.syncPreview.set(null);
    const outcome = await this.profile.enable();
    if (outcome.kind === 'saved') {
      this.syncMessage.set(
        `Settings sync is on. Saved ${formatBytes(outcome.bytes)} of preferences from this browser to your account. Your other browsers will pick them up next time you use them.`,
      );
      this.showUploaded(outcome.byCategory);
      return;
    }
    // Sync stays on either way — see `enable()` — but the failure is stated
    // rather than dressed up as a partial success.
    this.reportPush(outcome);
  }

  /** Decline permanently. The offer does not return. */
  protected declineSync(): void {
    this.clearNotice();
    this.profile.decline();
    this.syncMessage.set(
      'Settings stay on this browser only. You can turn sync on here later if you change your mind.',
    );
  }

  /**
   * Turn sync back on after stopping or declining.
   *
   * Routed through the same outcome handling as `syncNow()` because it is the
   * same situation: this browser is rejoining an account whose settings may
   * have moved on, and the conflict case has to be offered, not guessed.
   */
  protected async resumeSync(): Promise<void> {
    this.clearNotice();
    const outcome = await this.profile.resume();
    switch (outcome.kind) {
      case 'applied':
        this.syncMessage.set('Sync is back on. Updated this browser from your account. Reloading…');
        location.reload();
        return;
      case 'needs-decision':
        this.syncDecision.set({
          remote: outcome.remote,
          changes: outcome.changes,
          etag: outcome.etag,
          revision: outcome.revision,
        });
        return;
      case 'unchanged':
      case 'absent':
        // Nothing to take from the account, so this browser's settings become
        // what it holds. Same push the enable path performs.
        this.reportPush(await this.profile.push(true), 'Sync is back on.');
        return;
      case 'failed':
        this.syncError.set(outcome.message);
        return;
    }
  }

  protected disableSync(): void {
    this.clearNotice();
    this.profile.disable();
    // Says explicitly that nothing was deleted. An off switch people are afraid
    // of is an off switch that does not get used.
    this.syncMessage.set(
      'Stopped syncing on this browser. Nothing was deleted — your stored settings are still there, and you can turn sync back on here whenever you like.',
    );
  }

  /** Adopt settings this account already has stored from another browser. */
  protected async adoptRemote(): Promise<void> {
    this.clearNotice();
    const outcome = await this.profile.adoptRemote();
    if (outcome.kind === 'applied') {
      this.syncMessage.set('Updated this browser from your account. Reloading…');
      location.reload();
      return;
    }
    if (outcome.kind === 'needs-decision') {
      this.syncDecision.set({
        remote: outcome.remote,
        changes: outcome.changes,
        etag: outcome.etag,
        revision: outcome.revision,
      });
      return;
    }
    this.syncMessage.set(
      outcome.kind === 'failed' ? outcome.message : 'Nothing stored for this account yet.',
    );
  }

  /** Pull now, surfacing a decision if this browser has unsaved edits. */
  protected async syncNow(): Promise<void> {
    this.clearNotice();
    // Re-read the manifest first, bypassing the focus throttle. An explicit
    // "Sync now" is the one moment a user is watching, and this is where a
    // read-only flag left over from a stale free-tier token gets corrected —
    // otherwise the button would keep reporting a lapsed subscription that the
    // account does not have.
    await this.profile.recheckOnFocus(true);
    const outcome = await this.profile.pull();
    switch (outcome.kind) {
      case 'applied':
        this.syncMessage.set('Updated this browser from your account. Reloading…');
        location.reload();
        return;
      case 'needs-decision':
        this.syncDecision.set({
          remote: outcome.remote,
          changes: outcome.changes,
          etag: outcome.etag,
          revision: outcome.revision,
        });
        return;
      case 'unchanged':
        // Push anyway: unchanged means the *remote* has not moved, which says
        // nothing about whether this browser has edits waiting.
        this.reportPush(await this.profile.push(true), 'Already up to date.');
        return;
      case 'absent':
        this.reportPush(await this.profile.push(true));
        return;
      case 'failed':
        // An error, not a status line — same reason the two signals are
        // separate at all.
        this.syncError.set(outcome.message);
        return;
    }
  }

  /**
   * Turn a push outcome into a sentence.
   *
   * Every branch says what actually happened. The previous version discarded
   * the result and printed a success message unconditionally, so a failed
   * upload read as "Saved this browser's settings." — the failure mode that
   * makes a user trust a sync that is not running.
   *
   * `whenNothingToDo` covers the case where the push was a no-op because there
   * was nothing to send; the caller knows which reassurance fits.
   */
  private reportPush(outcome: PushOutcome, whenNothingToDo?: string): void {
    switch (outcome.kind) {
      case 'saved':
        this.showUploaded(outcome.byCategory);
        this.syncMessage.set(
          `Your Mawkingbird account is up to date. Saved ${formatBytes(outcome.bytes)} of preferences from this browser.`,
        );
        return;
      case 'not-syncing':
        this.syncMessage.set(
          whenNothingToDo ?? this.transloco.translate<string>('settings.config.syncOff'),
        );
        return;
      case 'read-only':
      case 'failed':
        // Deliberately not `syncMessage`: a failure is not a status update.
        this.syncError.set(outcome.message);
        return;
      case 'conflict':
        this.syncDecision.set({
          remote: outcome.remote,
          changes: outcome.changes,
          etag: outcome.etag,
          revision: outcome.revision,
        });
        return;
    }
  }

  /** Resolve a decision by taking the other browser's copy. */
  protected useRemote(): void {
    const decision = this.syncDecision();
    if (!decision) {
      return;
    }
    this.profile.useRemote(decision.remote, decision.etag, decision.revision);
    this.syncDecision.set(null);
    location.reload();
  }

  /** Resolve a decision by keeping this browser's copy and pushing it. */
  protected async keepLocal(): Promise<void> {
    const decision = this.syncDecision();
    if (!decision) {
      return;
    }
    const outcome = await this.profile.keepLocal(decision.etag, decision.revision);
    this.syncDecision.set(null);
    if (outcome.kind === 'saved') {
      this.syncMessage.set(
        `Kept this browser’s preferences and saved them to your Mawkingbird account.`,
      );
      this.showUploaded(outcome.byCategory);
      return;
    }
    this.reportPush(outcome);
  }

  protected dismissDecision(): void {
    this.syncDecision.set(null);
  }

  private previewConfig(config: PortableConfig): void {
    this.preview.set(config);
    this.changes.set(configChanges(config, localStorage));
  }

  private clearNotice(): void {
    this.error.set('');
    this.message.set('');
    this.exportMessage.set('');
    // Cleared too, so the result of the last sync cannot linger next to the
    // outcome of a different action and be read as describing it.
    this.syncMessage.set('');
    this.syncError.set('');
    this.syncUploaded.set(null);
  }

  /**
   * Record what an upload contained without exposing localStorage key names.
   *
   * `byCategory` remains part of the service result for diagnostics, but a user
   * cannot act on "setting" or `mockingbird_client_prefs`. The page names the
   * actual preference groups instead.
   */
  private showUploaded(byCategory: Record<string, string[]>): void {
    const keys = [...new Set(Object.values(byCategory).flat())];
    // Sorted by the *translated* name, so the list reads alphabetically in the
    // reader's language rather than in English's order.
    const entries = keys
      .map((key) => ({ key: this.configKeyLabelKey(key) }))
      .sort((a, b) =>
        this.transloco
          .translate<string>(a.key)
          .localeCompare(this.transloco.translate<string>(b.key)),
      );
    this.syncUploaded.set(entries.length ? entries : null);
  }

  private showError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'Configuration operation failed.');
  }
}

interface SyncedPreference {
  /**
   * Translation key naming the preference, resolved in the template.
   *
   * Was a pair of `key` (render identity) and `label` (English). Now one field
   * doing both: the translation key is stable enough to track by, and holding
   * the English here would keep this list out of the translation pipeline —
   * which matters because it is what the sync-conflict dialog shows when it asks
   * which device's settings to keep.
   */
  key: string;
}

/**
 * Translation keys describing every unscoped key portable config can contain.
 *
 * Keys rather than English: this list is what the sync-conflict dialog shows
 * when it asks which device's settings to keep, so a reader has to be able to
 * read it to answer.
 */
// i18n settings.config.key.clientPrefs: Appearance, reading, composing, and accessibility preferences
// i18n settings.config.key.houseAds: House-ad choices
// i18n settings.config.key.featureFlags: Optional feature choices
// i18n settings.config.key.anonymousPrefs: Anonymous-mode preferences
// i18n settings.config.key.searchServer: Search-server choice
// i18n settings.config.key.translationPref: Translation-service choice
// i18n settings.config.key.translationUsage: Translation usage counters (counts only — never translated text)
// i18n settings.config.key.vaultDevice: This browser’s display name
// i18n settings.config.key.openrouterModel: AI model choice
// i18n settings.config.key.openrouterPrompts: Custom AI prompt templates
// i18n settings.config.key.plusFeatures: Mawkingbird Plus feature choices
// i18n settings.config.key.homeServer: Home Mastodon server
// i18n settings.config.key.corsProxy: Web access and proxy choice
// i18n settings.config.key.shortener: Link-shortener choice
// i18n settings.config.key.other: Other browser preference
const CONFIG_KEY_LABELS: Readonly<Record<string, string>> = {
  mockingbird_client_prefs: 'settings.config.key.clientPrefs',
  mockingbird_house_ads: 'settings.config.key.houseAds',
  mockingbird_feature_flags: 'settings.config.key.featureFlags',
  mockingbird_anonymous_preferences: 'settings.config.key.anonymousPrefs',
  mockingbird_search_server_v1: 'settings.config.key.searchServer',
  mockingbird_translation_preference: 'settings.config.key.translationPref',
  mockingbird_translation_usage: 'settings.config.key.translationUsage',
  mockingbird_vault_device: 'settings.config.key.vaultDevice',
  mockingbird_openrouter_model: 'settings.config.key.openrouterModel',
  mockingbird_openrouter_prompts: 'settings.config.key.openrouterPrompts',
  mockingbird_plus_features: 'settings.config.key.plusFeatures',
  mastodon_mock_server: 'settings.config.key.homeServer',
  mockingbird_cors_proxy: 'settings.config.key.corsProxy',
  mockingbird_shortener: 'settings.config.key.shortener',
};
