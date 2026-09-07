import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../../api';
import { Auth } from '../../../auth';
import { ClientPrefs } from '../../../client-prefs';
import { POSTING_LANGUAGE_OPTIONS } from '../../../language-detect';
import {
  DEFAULT_PKM_VOCABULARY,
  PKM_KINDS,
  PkmKind,
  formatVocabularyField,
  parseVocabularyField,
  pkmNounKey,
} from '../../../pkm/pkm-tags';
import { WIZARD_STEPS, WizardStep, activeSteps, stepTitleKey } from '../../../publish-wizard';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Writing settings: everything about getting words out — where writing starts,
 * what gets asked at the moment you publish, and the drafts/notes workflow.
 *
 * Absorbed the old "Posting & Privacy" page's posting defaults, which were the
 * same subject reached from the other side. Those rows still appear on Privacy
 * too, deliberately: "what visibility do I publish at" and "who can see me" are
 * one setting seen through two different questions, and making the user guess
 * which category we filed it under is worse than showing it twice. Both pages
 * write the same credentials, so whichever one they find is the right one.
 *
 * Mixed client- and server-side as a result: the vocabulary, wizard and Home
 * composer prefs are localStorage and work anonymously, while posting defaults
 * need a server and hide themselves when there isn't one.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.writing.title: ✍ Writing
// i18n settings.writing.intro: Everything about getting words out: where writing starts, what gets asked at the moment you publish, and the workflow around drafts and notes.
// i18n settings.writing.whereStarts: Where writing starts
// i18n settings.writing.onHome: On Home
// i18n settings.writing.miniComposer: Open the mini composer automatically
// i18n settings.writing.writeButton: Write
// i18n settings.writing.quickPostButton: Quick post
// i18n settings.writing.miniComposer.hint.a: Off by default. Home shows a
// i18n settings.writing.miniComposer.hint.b: button, which opens the full editor, next to a
// i18n settings.writing.miniComposer.hint.c: button that expands the small box for that visit only. Turn this on to have the box already open every time, the way it used to be.
// i18n settings.writing.thoughtful: Thoughtful posting: nothing publishes straight from a box
// i18n settings.writing.thoughtful.hint: Stronger than the setting above, and it wins over it: Home offers no Quick post at all, and the editor only saves. You post later, from Drafts. Replies, chats and paste shares are never held back — they're urgent, or already deliberate.
// i18n settings.writing.askedAtPublish: Asked at the moment you publish
// i18n settings.writing.alsoOn.before: Also on
// i18n settings.writing.alsoOn.link: Privacy
// i18n settings.writing.alsoOn.after: , which is the same settings from the other direction — who ends up seeing this.
// i18n settings.writing.postingPrivacy: Posting privacy
// i18n settings.writing.requireAlt: Require a description on every attachment before posting
// i18n settings.writing.savePostingDefaults: Save posting defaults
// i18n settings.writing.wizard: The publish wizard
// i18n settings.writing.wizard.hint.before: What
// i18n settings.writing.wizard.hint.after: shows you between hitting Publish and the post going out. Turn off the steps you don't want; the ones left run in this order.
// i18n settings.writing.wizard.allOff: ⚠ Every step is off, so Publish goes straight to the composer — which is exactly how it behaved before this wizard existed.
// i18n settings.writing.warnPkm: Warn me before publishing something tagged as a note or a to-do
// i18n settings.writing.warnPkm.hint: A note to yourself and a post to your followers look identical in the composer. This is the one thing standing between them.
// i18n settings.writing.notes: Notes and to-dos
// i18n settings.writing.notes.hint.a: Tag a draft or a private post
// i18n settings.writing.notes.or: or
// i18n settings.writing.notes.hint.b: and it becomes a productivity object: it shows up beside the editor in
// i18n settings.writing.notes.hint.c: , instead of you having to go looking for it. A note is something you wrote down to keep. A to-do is something you owe a reply to. Both live either in this browser as drafts, or on the server as posts only you can see.
// i18n settings.writing.yourWords: Your words
// i18n settings.writing.yourWords.hint.a: is English, and this feature is useless if the word isn't yours. Set your own — comma-separated, and any of them will match. Tags are matched whole and case-insensitively, so
// i18n settings.writing.yourWords.and: and
// i18n settings.writing.yourWords.hint.b: are the same tag but
// i18n settings.writing.yourWords.hint.c: is not.
// i18n settings.writing.wordsThatMean: Words that mean "{{noun}}"
// i18n settings.writing.switchedOff: ⚠ Left empty, so switched off:
// i18n settings.writing.switchedOff.afterOne: . Nothing will be filed under it until you give it a word.
// i18n settings.writing.switchedOff.afterOther: . Nothing will be filed under them until you give them words.
// i18n settings.writing.saveWords: Save words
// i18n settings.writing.restoreDefaults: Restore defaults
// i18n settings.writing.savedTick: ✓ Saved
@Component({
  selector: 'app-settings-writing',
  imports: [FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './settings-writing.html',
})
export class SettingsWriting implements OnInit {
  protected prefs = inject(ClientPrefs);
  private api = inject(Api);
  protected auth = inject(Auth);

  // ---- server-backed posting defaults (also shown on the Privacy page) ----
  protected privacy = signal('public');
  protected sensitive = signal(false);
  protected language = signal('');
  protected readonly postingLanguageOptions = POSTING_LANGUAGE_OPTIONS;
  protected postingSaving = signal(false);
  protected postingSaved = signal(false);

  ngOnInit(): void {
    if (this.auth.isAnonymous) {
      return;
    }
    this.api.verifyCredentials().subscribe((acc) => {
      this.privacy.set(acc.source?.privacy ?? 'public');
      this.sensitive.set(acc.source?.sensitive ?? false);
      this.language.set(acc.source?.language ?? '');
    });
  }

  /**
   * Save only the posting fields.
   *
   * Deliberately does not send `locked`/`discoverable`/`bot`: this page never
   * loaded them, and a FormData update writes whatever it names. Sending them
   * from stale defaults would silently unlock an account whose owner came here
   * to change their default language.
   */
  protected savePosting(): void {
    if (this.postingSaving()) {
      return;
    }
    this.postingSaving.set(true);
    this.postingSaved.set(false);

    const form = new FormData();
    form.append('source[privacy]', this.privacy());
    form.append('source[sensitive]', String(this.sensitive()));
    form.append('source[language]', this.language().trim());

    this.api.updateCredentials(form).subscribe({
      next: () => {
        this.postingSaving.set(false);
        this.postingSaved.set(true);
        this.prefs.setDefaultVisibility(this.privacy());
        if (this.language()) this.prefs.addKnownLanguage(this.language());
      },
      error: () => this.postingSaving.set(false),
    });
  }

  protected readonly kinds = PKM_KINDS;
  protected readonly noun = pkmNounKey;
  protected saved = signal(false);

  protected readonly wizardSteps = WIZARD_STEPS;
  protected readonly stepTitleKey = stepTitleKey;

  /** True when every step is off, so Publish goes straight through. */
  protected wizardOff = computed(() => activeSteps(this.prefs.wizardSteps()).length === 0);

  protected stepOn(step: WizardStep): boolean {
    return this.prefs.wizardSteps()[step];
  }

  protected toggleStep(step: WizardStep, on: boolean): void {
    this.prefs.setWizardStep(step, on);
  }

  /**
   * The editable text of each field, seeded from the stored vocabulary.
   *
   * Held separately from the pref so a half-typed `todo, auf` isn't normalized
   * out from under the cursor on every keystroke. Committed on save.
   */
  protected fields = signal<Record<PkmKind, string>>(this.currentFields());

  /** Which kinds are currently switched off, for the warning under the fields. */
  protected disabledKinds = computed(() =>
    this.kinds.filter((kind) => parseVocabularyField(this.fields()[kind]).length === 0),
  );

  protected defaultsFor(kind: PkmKind): string {
    return formatVocabularyField(DEFAULT_PKM_VOCABULARY[kind]);
  }

  protected setField(kind: PkmKind, value: string): void {
    this.fields.update((fields) => ({ ...fields, [kind]: value }));
    this.saved.set(false);
  }

  protected save(): void {
    const fields = this.fields();
    this.prefs.setPkmVocabulary({
      note: parseVocabularyField(fields.note),
      todo: parseVocabularyField(fields.todo),
      cal: parseVocabularyField(fields.cal),
    });
    // Re-seed from what was actually stored, so the boxes show the normalized
    // words rather than whatever was typed.
    this.fields.set(this.currentFields());
    this.saved.set(true);
  }

  protected reset(): void {
    this.prefs.resetPkmVocabulary();
    this.fields.set(this.currentFields());
    this.saved.set(true);
  }

  protected toggleWarn(on: boolean): void {
    this.prefs.warnOnPkmPublish.set(on);
  }

  private currentFields(): Record<PkmKind, string> {
    const vocab = this.prefs.pkmVocabulary();
    return {
      note: formatVocabularyField(vocab.note),
      todo: formatVocabularyField(vocab.todo),
      cal: formatVocabularyField(vocab.cal),
    };
  }
}
