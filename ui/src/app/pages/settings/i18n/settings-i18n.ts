import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../../api';
import { Auth } from '../../../auth';
import { ClientPrefs } from '../../../client-prefs';
import { LANG_NAMES, LangCode, POSTING_LANGUAGE_OPTIONS } from '../../../language-detect';
import { KnownLanguages } from '../../../trend-language-filter';
import { UiLocale } from '../../../i18n/locale';
import { LocalePicker } from '../../../locale-picker/locale-picker';
import {
  ENGINE_LABELS,
  TRANSLATION_ENGINES,
  TranslationEngine,
  TranslationUsage,
} from '../../../translation-usage';
import { TranslocoPipe } from '@jsverse/transloco';

/** Languages offered in the "add a language" picker — the ones we can name. */
const PICKER_ORDER: LangCode[] = [
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'nl',
  'sv',
  'da',
  'no',
  'fi',
  'pl',
  'tr',
  'ru',
  'uk',
  'el',
  'ja',
  'ko',
  'zh',
  'ar',
  'he',
  'hi',
  'th',
  'eo',
  'is',
];

/**
 * Internationalization settings: which languages the user knows, and whether to
 * hide trending tags in languages they don't. "Known" is aggregated by
 * {@link KnownLanguages} from the interface language, the browser, the posting
 * default, and the explicit list edited here — this page surfaces where each
 * inferred language came from so the filter's behavior isn't a black box.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.i18n.title: Internationalization
// i18n settings.i18n.intro: Tell Mawkingbird which languages you read, and keep trending content relevant.
// i18n settings.i18n.postingLang: Posting language
// i18n settings.i18n.notSpecified: Not specified
// i18n settings.i18n.postingLang.hint: The default language Mastodon attaches to new posts.
// i18n settings.i18n.savePostingLang: Save posting language
// i18n settings.i18n.trending: Trending tags
// i18n settings.i18n.excludeTrends: Exclude languages I don't know from trending tags
// i18n settings.i18n.excludeTrends.hint: Hides trending hashtags that are clearly in a script for a language you haven't listed (e.g. Japanese or Arabic tags). Tags in the Latin alphabet, or ones we can't identify, are always kept. Applies everywhere trending tags appear.
// i18n settings.i18n.feedPosts: Feed posts
// i18n settings.i18n.hideForeign: Hide posts in languages I don't know (Home and Algo)
// i18n settings.i18n.hideForeign.hint: Removes posts confidently in a language you haven't listed, or that mislabel their own language. Posts whose language can't be determined are always kept. Also toggleable with the 🌐 button on Home and Algo.
// i18n settings.i18n.known: Languages you know
// i18n settings.i18n.known.hint: We infer these from your interface language, your browser, and your posting default. Add any others you read.
// i18n settings.i18n.removeLang: Remove {{lang}}
// i18n settings.i18n.auto: auto
// i18n settings.i18n.auto.title: Inferred automatically
// i18n settings.i18n.addLang: Add a language…
// i18n settings.i18n.add: Add
// i18n settings.i18n.learning: Languages you're learning
// i18n settings.i18n.learning.hint.before: Different from the languages you know. Posts in a language you're learning are
// i18n settings.i18n.learning.neverHidden: never hidden
// i18n settings.i18n.learning.hint.after: by the filter above, even when it's switched on — they're the ones you're here to read.
// i18n settings.i18n.appendTranslation: Show translation under the original
// i18n settings.i18n.stopLearning: Stop learning {{lang}}
// i18n settings.i18n.appendTranslation.hint: Unchecked, the translation replaces the original. Checked, you get both — which is the point of learning, but costs one translation per language on a post.
// i18n settings.i18n.learning.none: Not learning any languages yet.
// i18n settings.i18n.addLearning: Add a language you're learning…
// i18n settings.i18n.dontWaste: Don't waste calls
// i18n settings.i18n.skipSame: Don't translate a post that's already in my language
// i18n settings.i18n.skipSame.hint: Skips the request when a post declares your language, or clearly reads as it — translating it would hand back the same text and still spend a call. Posts whose language can't be determined are always translated when you ask.
// i18n settings.i18n.autoTranslate: Translate automatically
// i18n settings.i18n.auto.off: Off — translate only when I press 🌐
// i18n settings.i18n.auto.view: When a post scrolls into view
// i18n settings.i18n.auto.hover: When I hover over a post
// i18n settings.i18n.auto.hint.before: Translates posts in a language you're learning, using
// i18n settings.i18n.auto.hint.after: . Posts in a language you know are never translated, and neither are posts whose language can't be determined — those are usually English. Hovering needs a mouse, so it does nothing on a touchscreen.
// i18n settings.i18n.translateAll.before: Translate
// i18n settings.i18n.translateAll.every: every
// i18n settings.i18n.translateAll.after: foreign post, not just languages I'm learning
// i18n settings.i18n.translateAll.hint: Unbounded, and priced accordingly: every post in a language you don't read becomes a translation. Useful for reading a timeline you share no language with. Watch the daily count below.
// i18n settings.i18n.useAi: Let automatic translation spend OpenRouter credit ($$$)
// i18n settings.i18n.useAi.hint: Off by default. Choosing AI for the 🌐 button is one press you decided on; this is a loop that runs while you scroll, so it's a separate choice. Left off, automatic translation uses {{engine}} only.
// i18n settings.i18n.budget: Translation budget
// i18n settings.i18n.budget.hint: Translations are counted per day and per service, and the two budgets are kept separate — running out on one never blocks the other. Counts reset at midnight, your time. Only the number of translations is stored, never what was translated.
// i18n settings.i18n.budget.count: {{today}} today · {{left}} left
// i18n settings.i18n.budget.usedUp: Today's limit is used up. Translation with this service resumes at midnight, or raise the limit below.
// i18n settings.i18n.budget.warned: Past the point where you asked to be warned. Still working, up to the limit.
// i18n settings.i18n.budget.warnAt: Warn at
// i18n settings.i18n.budget.stopAt: Stop at
// i18n settings.i18n.budget.reset: Reset count
// i18n settings.i18n.budget.total: {{count}} translated with this service in total.
// i18n settings.i18n.inferred: Inferred from
// i18n settings.i18n.inferred.ui: Interface language:
// i18n settings.i18n.inferred.browser: Browser:
// i18n settings.i18n.inferred.noneReported: none reported
// i18n settings.i18n.inferred.posting: Posting default:
// i18n settings.i18n.inferred.notSet: not set
@Component({
  selector: 'app-settings-i18n',
  imports: [FormsModule, TranslocoPipe, LocalePicker],
  templateUrl: './settings-i18n.html',
})
export class SettingsI18n implements OnInit {
  protected readonly prefs = inject(ClientPrefs);
  private readonly known = inject(KnownLanguages);
  private readonly api = inject(Api);
  protected readonly auth = inject(Auth);

  /**
   * The interface language actually in effect.
   *
   * Was the frozen `UI_LANGUAGE` constant, which said "English" no matter what
   * the reader had chosen — the one line on this page guaranteed to be wrong for
   * anyone it mattered to. Reads {@link UiLocale} now, so the "Inferred from"
   * list tells the truth.
   */
  protected readonly uiLocale = inject(UiLocale);
  protected readonly uiLanguage = this.uiLocale.active;
  /** The posting default language, once fetched (bare code) — an inferred signal. */
  protected readonly postingLang = signal('');
  protected readonly postingLanguageOptions = POSTING_LANGUAGE_OPTIONS;
  protected readonly savingPostingLanguage = signal(false);
  protected readonly postingLanguageSaved = signal(false);
  /** Which language the "add" picker currently has selected. */
  protected readonly toAdd = signal<string>('');

  /** Browser locale chain (deduped bare codes), for the "inferred from" list. */
  protected readonly browserLangs: string[] = (() => {
    const list = navigator.languages?.length
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];
    return [...new Set(list.map((c) => c.toLowerCase().split(/[-_]/)[0]))];
  })();

  /** Everything the filter considers "known", for the summary chips. */
  protected readonly knownCodes = computed(() => [...this.known.codes()].sort());

  /** Picker options minus anything already explicitly listed. */
  protected readonly addable = computed(() => {
    const have = new Set(this.prefs.knownLanguages());
    return PICKER_ORDER.filter((c) => !have.has(c));
  });

  // --- languages I'm learning (i18n sprint 2) ---

  /** Which language the learning picker currently has selected. */
  protected readonly toLearn = signal<string>('');

  /**
   * Learning-picker options.
   *
   * Excludes what is already being learned, but deliberately **not** what is already
   * "known": the inferred known set contains the browser locale chain, and someone
   * whose browser reports Icelandic may still be learning it. Adding it moves it out
   * of known (see `ClientPrefs.addLearningLanguage`), which is the honest resolution
   * of that overlap rather than hiding the option.
   */
  protected readonly learnable = computed(() => {
    const already = new Set(this.prefs.learningLanguages());
    return PICKER_ORDER.filter((c) => !already.has(c));
  });

  protected addLearning(): void {
    const code = this.toLearn();
    if (code) {
      this.prefs.addLearningLanguage(code);
      this.toLearn.set('');
    }
  }

  protected removeLearning(code: string): void {
    this.prefs.removeLearningLanguage(code);
  }

  protected toggleAppend(code: string, append: boolean): void {
    this.prefs.setAppendTranslation(code, append);
  }

  ngOnInit(): void {
    // Posting default language is a server-side "you know this" signal. Fetch it
    // (skip for the anonymous browser-local account, which has no credentials)
    // and fold it into the explicit list so it survives offline too.
    if (!this.auth.isAnonymous) {
      this.api.verifyCredentials().subscribe({
        next: (acc) => {
          const lang = acc.source?.language?.toLowerCase().split(/[-_]/)[0] ?? '';
          this.postingLang.set(lang);
          if (lang) {
            this.prefs.addKnownLanguage(lang);
          }
        },
        error: () => this.postingLang.set(''),
      });
    }
  }

  // --- translation budgets (i18n sprint 1) ---

  protected readonly usage = inject(TranslationUsage);
  protected readonly engines = TRANSLATION_ENGINES;
  protected readonly engineLabels = ENGINE_LABELS;

  /**
   * Draft limit values, per engine, while someone is typing.
   *
   * Bound to the inputs rather than writing straight through to the store, because
   * `setLimits` clamps a soft limit up to the hard one — applying that on every
   * keystroke rewrites the number under the cursor as you type "100" through "1".
   */
  protected readonly draftLimits = signal<
    Record<TranslationEngine, { soft: string; hard: string }>
  >({
    mastodon: {
      soft: `${this.usage.softLimit('mastodon')}`,
      hard: `${this.usage.hardLimit('mastodon')}`,
    },
    openrouter: {
      soft: `${this.usage.softLimit('openrouter')}`,
      hard: `${this.usage.hardLimit('openrouter')}`,
    },
  });

  protected setDraft(engine: TranslationEngine, field: 'soft' | 'hard', value: string): void {
    this.draftLimits.update((all) => ({ ...all, [engine]: { ...all[engine], [field]: value } }));
  }

  protected saveLimits(engine: TranslationEngine): void {
    const draft = this.draftLimits()[engine];
    const soft = Number(draft.soft);
    const hard = Number(draft.hard);
    if (!Number.isFinite(soft) || !Number.isFinite(hard)) {
      return;
    }
    this.usage.setLimits(engine, soft, hard);
    // Reflect whatever the store actually kept, so a clamped value is visible rather
    // than leaving the box showing a number that was never saved.
    this.setDraft(engine, 'soft', `${this.usage.softLimit(engine)}`);
    this.setDraft(engine, 'hard', `${this.usage.hardLimit(engine)}`);
  }

  protected resetUsage(engine: TranslationEngine): void {
    this.usage.reset(engine);
  }

  name(code: string): string {
    return LANG_NAMES[code as LangCode] ?? code.toUpperCase();
  }

  add(): void {
    const code = this.toAdd();
    if (code) {
      this.prefs.addKnownLanguage(code);
      this.toAdd.set('');
    }
  }

  remove(code: string): void {
    this.prefs.removeKnownLanguage(code);
  }

  toggleExclude(on: boolean): void {
    this.prefs.setExcludeUnknownLangTrends(on);
  }

  savePostingLanguage(): void {
    if (this.savingPostingLanguage()) return;
    this.savingPostingLanguage.set(true);
    this.postingLanguageSaved.set(false);
    const form = new FormData();
    form.append('source[language]', this.postingLang());
    this.api.updateCredentials(form).subscribe({
      next: () => {
        this.savingPostingLanguage.set(false);
        this.postingLanguageSaved.set(true);
        if (this.postingLang()) this.prefs.addKnownLanguage(this.postingLang());
      },
      error: () => this.savingPostingLanguage.set(false),
    });
  }
}
