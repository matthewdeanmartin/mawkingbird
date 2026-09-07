import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../../api';
import { ClientPrefs } from '../../../client-prefs';
import { POSTING_LANGUAGE_OPTIONS } from '../../../language-detect';
import { TranslocoPipe } from '@jsverse/transloco';

/** The credentials fields this page owns, one per control. */
type PrivacyField = 'locked' | 'discoverable' | 'bot' | 'privacy' | 'sensitive' | 'language';

/**
 * Privacy: who can see the account, who sees each post, and what gets counted.
 *
 * The posting rows here are the same settings the Writing page shows, on
 * purpose — "default visibility" is a privacy question and a publishing
 * question at once, and there is no reason to make the user guess which shelf
 * we put it on. Both pages write the same credentials fields.
 *
 * Every control applies immediately. The page used to mix a "Save changes"
 * button for the server-backed rows with instant-apply checkboxes for the
 * browser-local ones, which meant two rows that looked identical behaved
 * differently and neither said so. One rule is easier to trust than two, and
 * the rule that survives is the one where a switch you flicked is a switch you
 * changed.
 *
 * A failed write reverts the control. Leaving it where the user put it would
 * show a privacy setting they do not actually have, and on this page in
 * particular that is the wrong way to be wrong: believing you are locked when
 * you are public is worse than being told the save failed.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.privacy.title: 🔒 Privacy
// i18n settings.privacy.intro: Who can see you, who can reach you, and what this app counts while you use it.
// i18n settings.privacy.applyNote: Every setting on this page applies the moment you change it.
// i18n settings.privacy.whoSees: Who can see you
// i18n settings.privacy.reach: Reach
// i18n settings.privacy.locked: Require follow requests
// i18n settings.privacy.locked.hint: Manually approve who can follow you.
// i18n settings.privacy.discoverable: Feature profile and posts in discovery algorithms
// i18n settings.privacy.automation: Automation
// i18n settings.privacy.bot: This is an automated account
// i18n settings.privacy.bot.hint: Signals to others that the account mainly performs automated actions.
// i18n settings.privacy.whoSeesPosts: Who sees what you post
// i18n settings.privacy.crosslink.before: The same controls are on
// i18n settings.privacy.crosslink.link: Writing
// i18n settings.privacy.crosslink.after: , where they read as "what am I being asked at the moment I publish" rather than "who ends up seeing this". Either page saves the same thing.
// i18n settings.privacy.visibility: Post visibility
// i18n settings.privacy.visibility.public: Public
// i18n settings.privacy.visibility.unlisted: Quiet public
// i18n settings.privacy.visibility.private: Followers only
// i18n settings.privacy.visibility.hint: Default visibility for new posts. You can change it per post.
// i18n settings.privacy.media: Media
// i18n settings.privacy.sensitive: Mark media as sensitive by default
// i18n settings.privacy.language: Posting language
// i18n settings.privacy.language.unset: Not specified
// i18n settings.privacy.language.hint: Default language attached to new posts. You can change it per post.
// i18n settings.privacy.counts: What this app counts
// i18n settings.privacy.analytics: Analytics
// i18n settings.privacy.analytics.label: Count my page views
// i18n settings.privacy.analytics.hint: Anonymous page counts only — which kinds of page get used, never which account, post or tag you looked at, and never a query string. Turn this off and the analytics script is never loaded at all: nothing is fetched, counted or sent. The script is served from this site, not from a third party. This one is stored in your browser, so there is nothing to save and nothing to fail.
// i18n common.errorPrefix: ⚠ {{message}}
@Component({
  selector: 'app-settings-privacy',
  imports: [FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './settings-privacy.html',
})
export class SettingsPrivacy implements OnInit {
  private api = inject(Api);
  protected prefs = inject(ClientPrefs);

  protected locked = signal(false);
  protected discoverable = signal(false);
  protected bot = signal(false);
  protected privacy = signal('public');
  protected sensitive = signal(false);
  protected language = signal('');
  protected readonly postingLanguageOptions = POSTING_LANGUAGE_OPTIONS;

  /** The field currently in flight, so only its own row shows a spinner. */
  protected saving = signal<PrivacyField | null>(null);
  /** The field that saved most recently, for the transient ✓ beside it. */
  protected saved = signal<PrivacyField | null>(null);
  /** Which field failed, and what to tell the user about it. */
  protected error = signal<{ field: PrivacyField; message: string } | null>(null);

  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.api.verifyCredentials().subscribe((acc) => {
      // Defaulted, not trusted: a server that omits a flag must leave the
      // control showing a real boolean, or the first save sends "undefined".
      this.locked.set(acc.locked ?? false);
      this.discoverable.set(acc.discoverable ?? false);
      this.bot.set(acc.bot ?? false);
      this.privacy.set(acc.source?.privacy ?? 'public');
      this.sensitive.set(acc.source?.sensitive ?? false);
      this.language.set(acc.source?.language ?? '');
    });
  }

  /**
   * Write one field, and one field only.
   *
   * A `FormData` update writes every key it names, so sending the whole form on
   * each change would let a stale value from another row ride along — the same
   * trap the Writing page avoids by never loading the fields it does not show.
   * One control, one key.
   */
  protected commit(field: PrivacyField, value: boolean | string): void {
    const previous = this.currentValue(field);
    this.setValue(field, value);
    this.error.set(null);
    this.saving.set(field);

    const form = new FormData();
    form.append(this.formKey(field), String(value).trim());

    this.api.updateCredentials(form).subscribe({
      next: () => {
        this.saving.set(null);
        this.markSaved(field);
        if (field === 'privacy') {
          this.prefs.setDefaultVisibility(String(value));
        }
        if (field === 'language' && value) {
          this.prefs.addKnownLanguage(String(value));
        }
      },
      error: (err: unknown) => {
        this.saving.set(null);
        // Put it back. The control must never show a state the server refused.
        this.setValue(field, previous);
        this.error.set({ field, message: describeFailure(err) });
      },
    });
  }

  protected errorFor(field: PrivacyField): string | null {
    const current = this.error();
    return current?.field === field ? current.message : null;
  }

  private markSaved(field: PrivacyField): void {
    this.saved.set(field);
    if (this.savedTimer) {
      clearTimeout(this.savedTimer);
    }
    this.savedTimer = setTimeout(() => this.saved.set(null), 2000);
  }

  private currentValue(field: PrivacyField): boolean | string {
    switch (field) {
      case 'locked':
        return this.locked();
      case 'discoverable':
        return this.discoverable();
      case 'bot':
        return this.bot();
      case 'privacy':
        return this.privacy();
      case 'sensitive':
        return this.sensitive();
      case 'language':
        return this.language();
    }
  }

  private setValue(field: PrivacyField, value: boolean | string): void {
    switch (field) {
      case 'locked':
        this.locked.set(value as boolean);
        break;
      case 'discoverable':
        this.discoverable.set(value as boolean);
        break;
      case 'bot':
        this.bot.set(value as boolean);
        break;
      case 'privacy':
        this.privacy.set(value as string);
        break;
      case 'sensitive':
        this.sensitive.set(value as boolean);
        break;
      case 'language':
        this.language.set(value as string);
        break;
    }
  }

  /** Account-level fields are top-level; posting defaults live under `source`. */
  private formKey(field: PrivacyField): string {
    switch (field) {
      case 'privacy':
        return 'source[privacy]';
      case 'sensitive':
        return 'source[sensitive]';
      case 'language':
        return 'source[language]';
      default:
        return field;
    }
  }
}

/**
 * Turn a failed write into something worth reading.
 *
 * Names the status code because the three that actually happen here mean very
 * different things to the person reading: a public-API server that simply does
 * not implement the field, a token that has expired, and a network that is
 * down are three different next actions.
 */
function describeFailure(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return "Couldn't save — something went wrong. Your setting is unchanged.";
  }
  if (err.status === 0) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (err.status === 401) {
    return "Couldn't save — the server rejected your login. Try signing in again.";
  }
  if (err.status === 403) {
    return "Couldn't save — this server won't let you change that setting.";
  }
  if (err.status === 422) {
    return "Couldn't save — the server wouldn't accept that value.";
  }
  return `Couldn't save — the server said ${err.status}. Your setting is unchanged.`;
}
