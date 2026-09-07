import { computed, inject, Injectable, Signal } from '@angular/core';
import { ClientPrefs } from './client-prefs';
import { confidentLanguage, detectScriptCandidates } from './language-detect';
import { Status, Tag } from './models';
import { UiLocale } from './i18n/locale';
import { stripHtml } from './sentiment';

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
    const set = new Set<string>([this.uiLocale.active(), ...this.browserLangs]);
    for (const c of this.prefs.knownLanguages()) {
      set.add(bare(c));
    }
    return set;
  });

  knows(code: string): boolean {
    return this.codes().has(bare(code));
  }
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

/**
 * Minimum characters of stripped text before we trust content-based detection
 * of a post's language. Below this, a post is "too short to tell" and we defer
 * entirely to its declared language.
 */
const MIN_TEXT_FOR_DETECTION = 20;

/** Why a post was hidden (for diagnostics / tests). */
export type HideReason = 'foreign' | 'misrepresented';

/**
 * Removes feed posts by language, for Home and Algo. The product rule, stated
 * precisely and matching the "language toggle" the user asked for:
 *
 *   Anything goes, EXCEPT posts we can identify *for sure* as either
 *     (a) **foreign** — a language the user has said they don't know, or
 *     (b) **misrepresented** — the post declares one language but its text is
 *         confidently a different one (the classic "tagged en, actually es").
 *
 * The overriding constraint: **never hide a post we're unsure about.** Language
 * ID is hard; when it's hard, we don't guess on the user's behalf. Concretely:
 *   - No declared language and text too short/ambiguous to detect → keep.
 *   - Declared language the user knows → keep (we don't police honesty upward).
 *   - Confident detection only counts when the text is long enough and one
 *     language clearly dominates ({@link confidentLanguage}).
 */
@Injectable({ providedIn: 'root' })
export class FeedLanguageFilter {
  private prefs = inject(ClientPrefs);
  private known = inject(KnownLanguages);

  /**
   * Detected language per status id — the expensive half of {@link hideReason},
   * remembered so a feed recompute does not re-run it.
   *
   * ## Why this is needed
   *
   * `Home.visible()` reads a `now()` signal that a 30-second interval writes to,
   * so the whole loaded feed is re-filtered twice a minute for as long as the tab
   * is open. Before this, every one of those passes re-ran `stripHtml` plus the
   * full lexical detector — a per-character script loop, diacritic regexes and a
   * stop-word tokenizer — for every post. Measured at ~75ms per pass over 400
   * posts, paid forever, to recompute an answer that cannot have changed.
   *
   * ## Why only the detection is cached
   *
   * `hideReason` mixes a pure function of the post's text with live policy: the
   * `hideForeignLangPosts` toggle, `isLearning`, and the allowed-language set.
   * Those are prefs the user changes and expects to see take effect immediately,
   * so caching the *verdict* would leave the feed showing a stale answer until
   * reload. Caching the detection alone is safe because a post's text is fixed
   * for a given id: same input, same output, forever.
   *
   * `null` is a real cached value ("looked, and could not tell confidently"), so
   * presence is tested with `has` rather than a truthiness check — otherwise the
   * undetectable posts, which are the ones that ran the detector for nothing,
   * would be exactly the ones that never get cached.
   *
   * In memory only, like {@link CalmVerdicts}: a persisted verdict would outlive
   * the post text that justified it, and an edited post must be re-read.
   */
  private detected = new Map<string, string | null>();

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

  /**
   * A *confident* single language for a post's text, or null when the text is
   * too short or too mixed to be sure. Uses the full lexical detector (posts,
   * unlike tags, carry enough words for the stop-word tier).
   */
  private confidentTextLanguage(text: string): string | null {
    if (text.length < MIN_TEXT_FOR_DETECTION) {
      return null;
    }
    return confidentLanguage(text);
  }

  /**
   * {@link confidentTextLanguage} for a post, answered from {@link detected}
   * after the first look.
   *
   * Keyed on the *target* status — the reblogged post when there is one — because
   * that is whose text was detected. Keying on the boosting wrapper would give
   * the same original post a different answer depending on who boosted it, and
   * would miss the cache every time.
   */
  private detectedLanguageFor(target: Status): string | null {
    // `has`, not a truthiness test: `null` is a real answer meaning "looked and
    // could not tell", and it is the answer for the posts that ran the detector
    // for nothing — precisely the ones most worth not repeating.
    if (this.detected.has(target.id)) {
      return this.detected.get(target.id) ?? null;
    }
    const language = this.confidentTextLanguage(stripHtml(target.content));
    this.detected.set(target.id, language);
    return language;
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
    const detected = this.detectedLanguageFor(target);

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

  /**
   * The language a post is effectively in, or null when we aren't sure.
   *
   * Same derivation {@link hideReason} uses — declared language first, confident
   * detection second, null when neither commits. Shared so that "which posts get
   * hidden" and "which posts get translated" can never drift apart in their idea of
   * what language a post is in.
   */
  effectiveLanguage(status: Status): string | null {
    const target = status.reblog ?? status;
    const declared = target.language?.toLowerCase().split(/[-_]/)[0] || null;
    // Shares `hideReason`'s cache, which is the point: these two must agree on
    // what language a post is in, and now they cannot even disagree by accident.
    return declared ?? this.detectedLanguageFor(target);
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
    return this.detectedLanguageFor(status.reblog ?? status);
  }
}

/** Why a post is not eligible for automatic translation, for diagnostics and tests. */
export type SkipReason =
  /** Automatic translation is switched off entirely. */
  | 'mode-off'
  /** We can't tell what language it's in — so it's probably English. */
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
 *   2. **Undetermined** ⇒ never. `FeedLanguageFilter` already refuses to guess below
 *      its confidence threshold, and this inherits that refusal. An undetermined post
 *      is overwhelmingly likely to be English, and translating English into English is
 *      a call spent to change nothing.
 *   3. **Known** ⇒ never. You already read it.
 *   4. **Learning** ⇒ yes. The point of the feature.
 *   5. Anything else ⇒ only when the `$$$` translate-all switch is on.
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
    // Declared language first, confident detection second, null when neither commits —
    // the same derivation hiding uses, so the two can never disagree about what
    // language a post is in.
    const effective = this.filter.effectiveLanguage(status);
    if (!effective || bare(effective) !== wanted) {
      return false;
    }
    // ...but a declaration this app can *see* is wrong does not get to refuse the
    // translation.
    //
    // `effectiveLanguage` trusts `status.language` unconditionally and only detects
    // when nothing was declared. That is right for hiding — a reader who hides a
    // language is acting on what the post claims — and wrong here, because the cost
    // is asymmetric: wrongly spending one request is a rounding error, and wrongly
    // refusing tells someone their plainly German post "already looks like English"
    // and offers them a settings page. Which is exactly what a post declaring `en`
    // over "Die Nutzung der Musik war ihm doch verboten worden?" did.
    //
    // Mis-declared language is common and usually nobody's fault: clients default
    // the field to the composer's UI locale, so anyone posting in a second language
    // ships the wrong tag. So when the detector is *confident* and disagrees with the
    // declaration, the declaration loses and the translation goes ahead. When the
    // detector is unsure it says nothing and the declaration stands, unchanged from
    // before.
    const detected = this.filter.detectedLanguage(status);
    return !detected || bare(detected) === wanted;
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
