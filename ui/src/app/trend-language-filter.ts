import { computed, inject, Injectable, Signal } from '@angular/core';
import { ClientPrefs } from './client-prefs';
import { detectScriptCandidates, LanguageAnalysis, LanguageDecision } from './language-detect';
import { Status, Tag } from './models';
import { UiLocale } from './i18n/locale';
import { analyzeStatusLanguage } from './status-language';

/**
 * The interface language the app ships in **when nothing else is known**.
 *
 * This used to be *the* interface language, back when there was only one. It is
 * now only the floor: the live value comes from {@link UiLocale.active}, which
 * accounts for the user's choice and the browser's preference. Kept exported
 * because it is still the right answer anywhere a locale is needed outside an
 * injection context.
 *
 * @deprecated Prefer `inject(UiLocale).active()` — this constant cannot see a
 * reader who switched the interface to German.
 */
export const UI_LANGUAGE = 'en';

/** Normalize a possibly-regioned tag ("en-US", "pt_BR") to a bare ISO 639-1 code. */
function bare(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0];
}

/**
 * The set of languages we believe the user knows, aggregated from every signal
 * the app can see without asking. Mastodon leaks language knowledge in three
 * places, and we mirror all of them:
 *
 *   1. **Interface language** — what the UI is rendered in ({@link UiLocale.active}),
 *      plus the browser's `navigator.languages` (the OS/browser locale chain).
 *   2. **Posting default language** — pushed into `knownLanguages` by the caller
 *      that reads `source.language` (kept as an explicit entry so it survives
 *      even if the account/API isn't reachable later).
 *   3. **Explicit choices** — the future "public timeline languages" checkbox
 *      list, stored in {@link ClientPrefs.knownLanguages}.
 *
 * The result is always non-empty (UI language is a floor), so the trending
 * filter can never hide *everything* by accident.
 */
@Injectable({ providedIn: 'root' })
export class KnownLanguages {
  private prefs = inject(ClientPrefs);
  private uiLocale = inject(UiLocale);

  /** Browser locale chain, computed once (it doesn't change within a session). */
  private readonly browserLangs: string[] = (() => {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const list = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
    return list.map(bare);
  })();

  /**
   * ISO 639-1 codes the user is assumed to know. Reactive to the prefs list and
   * to the interface language — someone who switches the UI to German has told
   * us they read German, and trending tags should follow immediately.
   */
  readonly codes: Signal<Set<string>> = computed(() => {
    const set = new Set<string>([bare(this.uiLocale.active()), ...this.browserLangs]);
    for (const c of this.prefs.knownLanguages()) {
      set.add(bare(c));
    }
    return set;
  });

  knows(code: string): boolean {
    return this.codes().has(bare(code));
  }

  /** Knowing every established possibility is enough; a partial clue list is not. */
  understands(result: LanguageDecision): boolean {
    return (
      result.candidatesComplete &&
      result.candidates.length > 0 &&
      result.candidates.every((lang) => this.knows(lang))
    );
  }
}

export interface ReaderLanguageAssessment extends LanguageAnalysis {
  /** A live reader-specific conclusion, never persisted in the detector's cache. */
  userKnowsLanguage: boolean;
}

/**
 * Filters trending hashtags down to languages the user can actually read.
 *
 * The rule, deliberately conservative: **hide a tag only when we are *sure* it
 * is a language the user hasn't listed.** Certainty comes from
 * {@link detectScriptLanguage}, which only commits on non-Latin scripts — so
 * "#東京" is dropped for a non-Japanese reader, while "#Eurovision" (Latin,
 * undetermined) is always kept. When the toggle is off, nothing is filtered.
 *
 * Applied centrally in `Api.trendingTags()` so every surface that shows trending
 * tags (left rail, Explore, Search) inherits it with no per-page wiring.
 */
@Injectable({ providedIn: 'root' })
export class TrendLanguageFilter {
  private prefs = inject(ClientPrefs);
  private known = inject(KnownLanguages);

  /** Whether a single tag should be shown given the current settings. */
  shouldShow(tag: Tag): boolean {
    if (!this.prefs.excludeUnknownLangTrends()) {
      return true;
    }
    // Strip a leading '#' if present; detect on the bare name.
    const candidates = detectScriptCandidates(tag.name.replace(/^#/, ''));
    if (!candidates.length) {
      return true; // undetermined ⇒ keep
    }
    // Keep if the user knows ANY candidate language. For bare Han the candidates
    // are [zh, ja], so it's hidden only from someone who knows neither — which
    // is exactly the case a monolingual-English reader hits with kanji trends.
    return candidates.some((lang) => this.known.knows(lang));
  }

  /** Filter a list of tags, preserving order. */
  apply(tags: Tag[]): Tag[] {
    if (!this.prefs.excludeUnknownLangTrends()) {
      return tags;
    }
    return tags.filter((t) => this.shouldShow(t));
  }
}

/** Why a post was hidden (for diagnostics / tests). */
export type HideReason = 'foreign' | 'misrepresented';

/**
 * Feed policy consumes text evidence separately from the post's declaration.
 * Keep content when all established possibilities are allowed, including
 * readable posts with incorrect metadata. Unknown text remains visible unless
 * a declaration supplies a foreign language. Explicit feed narrowing and
 * learning-language exemptions remain independent of the knowledge flag.
 */
@Injectable({ providedIn: 'root' })
export class FeedLanguageFilter {
  private prefs = inject(ClientPrefs);
  private known = inject(KnownLanguages);

  /** Cache pure analysis only; preferences must take effect immediately.
   * Content and warning text are checked as well as id, so edits invalidate it.
   */
  private detected = new Map<
    string,
    { content: string; spoiler: string; analysis: LanguageAnalysis }
  >();

  /**
   * The languages a post is allowed to be in: the explicit narrowed set when
   * one is chosen, otherwise everything the user knows.
   *
   * Narrowing is the "I follow 400 people and want only Esperanto today" case.
   * It never *widens* — a language outside the known set can still be selected
   * (you might be learning it), which is why this reads the pref directly
   * rather than intersecting with {@link KnownLanguages}.
   */
  private allowed(): Set<string> {
    const chosen = this.prefs.feedLanguages();
    return chosen.length ? new Set(chosen.map(bare)) : this.known.codes();
  }

  /** Analyze the boosted original's structure without flattening quotes or links. */
  private analysisFor(target: Status): LanguageAnalysis {
    const spoiler = target.spoiler_text ?? '';
    const cached = this.detected.get(target.id);
    if (cached && cached.content === target.content && cached.spoiler === spoiler)
      return cached.analysis;
    const analysis = analyzeStatusLanguage(target.content, spoiler);
    this.detected.set(target.id, { content: target.content, spoiler, analysis });
    return analysis;
  }

  /** Pure detection is cached; known-language preferences are evaluated on every read. */
  languageAssessment(status: Status): ReaderLanguageAssessment {
    const analysis = this.analysisFor(status.reblog ?? status);
    return { ...analysis, userKnowsLanguage: this.known.understands(analysis) };
  }

  /**
   * Forget every detection, so the next read re-runs it.
   *
   * Call on a real feed reload, for the same reason {@link CalmVerdicts.reset}
   * exists: an edited post is new text under an old id, and the cache would
   * otherwise answer for the version that is gone.
   */
  reset(): void {
    this.detected.clear();
  }

  /**
   * Why this post should be hidden, or null to keep it. Exposed (rather than a
   * bare boolean) so callers can log the reason and tests can assert it.
   */
  hideReason(status: Status): HideReason | null {
    if (!this.prefs.hideForeignLangPosts()) {
      return null;
    }
    const target = status.reblog ?? status;
    const declared = target.language?.toLowerCase().split(/[-_]/)[0] || null;
    const analysis = this.analysisFor(target);
    const detected = analysis.language;

    // A language you are *learning* is never hidden, whatever the toggle says.
    //
    // This is the one place the learner rule has to live, because hiding happens before
    // anything else gets a chance to look at the post: filtering away the Icelandic
    // posts from someone learning Icelandic removes exactly the material they follow
    // those accounts for. It applies even with no translation feature switched on —
    // "show me this language" is useful by itself.
    //
    // Checked against both the declared and the detected language, and deliberately
    // *before* the misrepresentation branch: a post mislabelled `en` whose text is
    // confidently Esperanto is still Esperanto practice, and the mislabelling is the
    // poster's mistake rather than a reason to withhold it from a learner.
    if (
      (declared && this.prefs.isLearning(declared)) ||
      (detected && this.prefs.isLearning(detected))
    ) {
      return null;
    }

    // A reader can know all possibilities without the detector selecting one.
    // Respect explicit feed narrowing separately from the reader's knowledge.
    // This also prevents bad metadata from hiding text they demonstrably read.
    if (
      analysis.candidatesComplete &&
      analysis.candidates.length &&
      analysis.candidates.every((lang) => this.allowed().has(bare(lang)))
    )
      return null;

    // (b) Misrepresentation: declares one language, text is confidently another.
    if (declared && detected && declared !== detected) {
      return 'misrepresented';
    }

    // (a) Foreign: the post's effective language is one the user doesn't know.
    // A declared language is trusted as-is; otherwise fall back to confident
    // detection. If we have neither, we don't know — so we keep it.
    const effective = declared ?? detected;
    if (effective && !this.allowed().has(bare(effective))) {
      return 'foreign';
    }
    return null;
  }

  shouldShow(status: Status): boolean {
    return this.hideReason(status) === null;
  }

  /** Filter a list of statuses, preserving order. */
  apply(statuses: Status[]): Status[] {
    if (!this.prefs.hideForeignLangPosts()) {
      return statuses;
    }
    return statuses.filter((s) => this.shouldShow(s));
  }

  /** Legacy metadata-first language for automatic translation preferences.
   * Use languageAssessment for readability, candidates and diagnostic evidence.
   */
  effectiveLanguage(status: Status): string | null {
    const target = status.reblog ?? status;
    const declared = target.language?.toLowerCase().split(/[-_]/)[0] || null;
    // Reuse the same pure analysis while retaining this accessor's metadata policy.
    return declared ?? this.analysisFor(target).language;
  }

  /**
   * What the *text* looks like, ignoring what the post claims — or null when the
   * detector will not commit.
   *
   * Deliberately separate from {@link effectiveLanguage}, which prefers the
   * declaration. A caller that needs to know whether a declaration is credible
   * has to be able to ask the two questions apart; see
   * `AutoTranslateEligibility.isAlreadyTargetLanguage`, where a wrong `en` tag on
   * a German post was refusing the translation outright.
   */
  detectedLanguage(status: Status): string | null {
    return this.analysisFor(status.reblog ?? status).language;
  }
}

/** Why a post is not eligible for automatic translation, for diagnostics and tests. */
export type SkipReason =
  /** Automatic translation is switched off entirely. */
  | 'mode-off'
  /** We cannot determine the language from the available evidence. */
  | 'undetermined'
  /** The reader already reads this language. */
  | 'known'
  /** Not a language being learned, and translate-all is off. */
  | 'not-learning';

/**
 * Decides which posts automatic translation should spend a call on.
 *
 * Separate from {@link FeedLanguageFilter} because the questions are different — that
 * one decides what you see, this one decides what gets paid for — but built on its
 * language derivation so the two always agree about what language a post is in.
 *
 * The rules, in the order they are checked:
 *
 *   1. **Mode off** ⇒ never. The default, and the only state that costs nothing.
 *   2. **All possibilities known** ⇒ never, unless a candidate is being learned.
 *   3. **Undetermined** ⇒ never. `FeedLanguageFilter` already refuses to guess below
 *      its evidence requirements, and this inherits that refusal. Unknown is
 *      never assumed to be English.
 *   4. **Learning** ⇒ yes. The point of the feature.
 *   5. **Known** ⇒ never. You already read it.
 *   6. Anything else ⇒ only when the `$$$` translate-all switch is on.
 */
@Injectable({ providedIn: 'root' })
export class AutoTranslateEligibility {
  private prefs = inject(ClientPrefs);
  private known = inject(KnownLanguages);
  private filter = inject(FeedLanguageFilter);

  /** Why this post should not be auto-translated, or null when it should be. */
  skipReason(status: Status): SkipReason | null {
    if (this.prefs.autoTranslateMode() === 'off') {
      return 'mode-off';
    }
    const assessment = this.filter.languageAssessment(status);
    if (
      assessment.userKnowsLanguage &&
      !assessment.candidates.some((lang) => this.prefs.isLearning(lang))
    )
      return 'known';
    const language = this.filter.effectiveLanguage(status);
    if (!language) {
      return 'undetermined';
    }
    // Learning is checked before known so that a language somehow in both lists still
    // gets translated. `addLearningLanguage` prevents that overlap, but a hand-edited
    // prefs blob can produce it, and silently translating nothing would be the more
    // confusing failure.
    if (this.prefs.isLearning(language)) {
      return null;
    }
    if (this.known.knows(language)) {
      return 'known';
    }
    return this.prefs.translateAllForeign() ? null : 'not-learning';
  }

  shouldTranslate(status: Status): boolean {
    return this.skipReason(status) === null;
  }

  /**
   * True when translating this post into `target` would return the post itself.
   *
   * Guards *every* translate path, including the manual 🌐 button — a wasted call is
   * wasted whoever asked for it, and clicking translate on an obviously-English post is
   * the case that prompted this. Answers false when the setting is off, and when the
   * language is anything less than confidently known: refusing a translation someone
   * needed is a worse failure than spending one request, so uncertainty always resolves
   * toward translating.
   */
  isAlreadyTargetLanguage(status: Status, target: string): boolean {
    if (!this.prefs.skipSameLanguageTranslation()) {
      return false;
    }
    const wanted = bare(target);
    if (!wanted) {
      return false;
    }
    // A declaration is not evidence. Unknown text must remain translatable,
    // including posts whose clients silently declared the composer's UI locale.
    const detected = this.filter.detectedLanguage(status);
    return !!detected && bare(detected) === wanted;
  }

  /**
   * Whether this post's translation appends below the original rather than replacing
   * it. Only learning languages append — a `$$$` translate-all post is one the reader
   * has no interest in learning, so the original is noise to them.
   */
  appends(status: Status): boolean {
    const language = this.filter.effectiveLanguage(status);
    return !!language && this.prefs.isLearning(language) && this.prefs.appendsTranslation(language);
  }
}
