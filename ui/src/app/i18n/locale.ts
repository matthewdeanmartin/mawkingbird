/**
 * Which language the interface renders in, and how that gets decided.
 *
 * Three signals can name a locale, and they are not equal. In precedence order:
 *
 *   1. **An explicit choice** the user made (footer picker, or Settings →
 *      Internationalization). Once made it wins forever, against every other
 *      signal, on every visit.
 *   2. **The browser's locale chain** (`navigator.languages`), matched against
 *      the locales this build actually ships.
 *   3. **English**, as the floor.
 *
 * The interesting rule is that (2) is **never written to storage**. It is
 * tempting to persist the negotiated result "so it's stable", but that quietly
 * converts a guess into a decision: a reader whose browser said German, who
 * later moves to a French laptop, would be stuck on German with nothing in the
 * UI explaining why — and no way to tell their stored "choice" from a choice
 * they actually made. Only {@link LocalePicker} writes.
 *
 * Note what this file does *not* do: it never falls back to a *partially*
 * translated experience being an error. A locale that is missing keys renders
 * those keys in English (Transloco's `fallbackLang`), which is what lets a new
 * feature ship in English on the day it lands without blocking on 60
 * translations. See sprint/ui-i18n-0-overview.md.
 */

import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, Signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ClientPrefs } from '../client-prefs';
import { isCanaryBuild, isTestBuild } from '../build-flavor';

/**
 * Locales this build ships a dictionary for.
 *
 * Grows in sprint ui-i18n-7 as translations land. Adding an entry here is the
 * *only* code change a new language needs — the picker, the negotiation, and
 * the settings control all read from this list.
 */
export const PRODUCTION_LOCALES = [
  'en',
  'de',
  'fr',
  'id',
  'ja',
  'zh-Hant',
  'uk',
  'ko',
  'es',
  'pt',
  'it',
  'nl',
  'pl',
  'ru',
  'tr',
] as const;
/**
 * Locales shipped only to `/test/` and `/canary/`.
 *
 * Empty now that every translated dictionary ships to production. A new
 * language lands here first, gets reviewed on canary, then moves up to
 * {@link PRODUCTION_LOCALES}.
 */
export const IN_PROGRESS_LOCALES = ['vi', 'hi', 'sv'] as const;

export type SupportedLocale =
  | (typeof PRODUCTION_LOCALES)[number]
  | (typeof IN_PROGRESS_LOCALES)[number];

/**
 * Locales exposed by a deployment.
 *
 * `/test/` and `/canary/` are review surfaces, so they deliberately offer
 * dictionaries that are still falling back to English key by key. Root
 * production only advertises locales we are ready to negotiate automatically
 * for every matching visitor.
 */
export function supportedLocales(baseUri: string): readonly SupportedLocale[] {
  return isTestBuild(baseUri) || isCanaryBuild(baseUri)
    ? [...PRODUCTION_LOCALES, ...IN_PROGRESS_LOCALES]
    : PRODUCTION_LOCALES;
}

export const SUPPORTED_LOCALES = supportedLocales(
  typeof document === 'undefined' ? 'https://mawkingbird.com/' : document.baseURI,
);

/** The locale every other one falls back to, key by key. */
export const FALLBACK_LOCALE: SupportedLocale = 'en';

/**
 * Each locale's name **in its own language**.
 *
 * Never localized, deliberately. Someone who has landed in a language they
 * cannot read needs to find their own language in this list, and "German"
 * is no help to a reader who only reads German. Every real language picker
 * on the web works this way.
 */
export const LOCALE_ENDONYMS: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  id: 'Bahasa Indonesia',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  sv: 'Svenska (pågående)',
  fi: 'Suomi',
  is: 'Íslenska',
  ru: 'Русский',
  tr: 'Türkçe',
  vi: 'Tiếng Việt (đang thực hiện)',
  hi: 'हिन्दी (कार्य जारी)',
  ja: '日本語',
  'zh-Hant': '繁體中文（台灣）',
  uk: 'Українська',
  ko: '한국어',
};

/** Preserve an explicit script; infer Traditional Chinese only from its regions. */
function localeCandidate(code: string): string | null {
  try {
    const locale = new Intl.Locale(code.replaceAll('_', '-'));
    if (locale.language === 'zh') {
      if (locale.script) {
        return locale.script === 'Hant' ? 'zh-Hant' : null;
      }
      return ['TW', 'HK', 'MO'].includes(locale.region ?? '') ? 'zh-Hant' : null;
    }
    return locale.language === 'no' ? 'nb' : locale.language;
  } catch {
    return null;
  }
}

function isSupported(code: string): code is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

/**
 * Best supported locale for a browser locale chain.
 *
 * Matches regional variants, so `de-AT` and `de-CH` both resolve to `de`: shipping
 * regional variants is not on the table at 60 languages, and an Austrian reader
 * is far better served by German than by English. Order is the browser's own
 * preference order, so the first match wins.
 *
 * Exported for tests and for the picker's "Automatic" label.
 */
export function negotiateLocale(
  chain: readonly string[],
  available: readonly SupportedLocale[] = SUPPORTED_LOCALES,
): SupportedLocale {
  for (const entry of chain) {
    const code = localeCandidate(entry);
    const match = available.find((locale) => locale === code);
    if (match) {
      return match;
    }
  }
  return FALLBACK_LOCALE;
}

/** The browser's locale chain, or an empty list where there is no navigator. */
function browserChain(): string[] {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav) {
    return [];
  }
  return nav.languages?.length ? [...nav.languages] : nav.language ? [nav.language] : [];
}

/**
 * Which locale is in effect.
 *
 * **Deliberately does not inject `TranslocoService`.** `KnownLanguages`
 * (trend-language-filter.ts) reads this, and `Api` reads that, so this service
 * sits in the dependency graph of nearly every other service in the app. Taking
 * a Transloco dependency here would drag the whole translation stack into every
 * unit test — including the ~30 specs that call `TestBed.resetTestingModule()`
 * in their own `beforeEach`, discarding the globally-installed test providers
 * and then failing with `No provider for TRANSLOCO_TRANSPILER` on a service
 * that has nothing to do with translation.
 *
 * Pushing the locale *into* Transloco is therefore a separate concern, owned by
 * {@link TranslocoLocaleSync}, which is wired up once at bootstrap. This service
 * stays a pure computation over preferences and `navigator.languages`.
 */
@Injectable({ providedIn: 'root' })
export class UiLocale {
  private prefs = inject(ClientPrefs);

  /**
   * The browser's preference, computed once. `navigator.languages` does not
   * change within a page load, and re-reading it per render would be noise.
   */
  private readonly negotiated = negotiateLocale(browserChain());

  /**
   * The locale actually in effect: the stored choice if there is one, else the
   * browser's. Reactive, so changing the choice re-renders the app.
   */
  readonly active: Signal<SupportedLocale> = computed(() => {
    const chosen = this.prefs.uiLocale();
    if (chosen && isSupported(chosen)) {
      return chosen;
    }
    // A stored locale this build doesn't ship (older/newer build, hand-edited
    // storage) is not an error: fall through to the browser, then to English.
    return this.negotiated;
  });

  /** True when no explicit choice is stored, so the browser is deciding. */
  readonly isAutomatic = computed(() => {
    const chosen = this.prefs.uiLocale();
    return !chosen || !isSupported(chosen);
  });

  /** Locales offered in a picker, in the order they should be listed. */
  readonly available = SUPPORTED_LOCALES;

  /**
   * True when a picker is worth showing at all.
   *
   * A one-option language menu is pure noise on an already-crowded footer, so
   * the control hides itself until a second locale ships. This is why turning
   * on the day-one languages is a one-line change to
   * {@link SUPPORTED_LOCALES} and nothing else.
   */
  readonly hasChoice = SUPPORTED_LOCALES.length > 1;

  /**
   * Force a locale, or pass `null` to hand the decision back to the browser.
   *
   * The `null` case matters more than it looks: without it, forcing a locale
   * once would be irreversible, which is a trap for anyone testing translations
   * more than for an ordinary reader.
   */
  choose(locale: SupportedLocale | null): void {
    // ClientPrefs persists from a constructor effect over its own signals, so
    // setting the signal is the whole write — see its constructor.
    this.prefs.uiLocale.set(locale);
  }

  /** The locale the browser would pick, for labelling the "Automatic" option. */
  get browserPreference(): SupportedLocale {
    return this.negotiated;
  }
}

/**
 * Keeps Transloco's active language in step with {@link UiLocale}.
 *
 * Split out of `UiLocale` so that reading the locale costs nothing: see the note
 * on that class. Instantiated once from `provideI18n()` at bootstrap, which is
 * the only place that needs both halves.
 */
@Injectable({ providedIn: 'root' })
export class TranslocoLocaleSync {
  private locale = inject(UiLocale);
  private transloco = inject(TranslocoService);
  private document = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const active = this.locale.active();
      this.document.documentElement.lang = active;
      if (this.transloco.getActiveLang() !== active) {
        this.transloco.setActiveLang(active);
      }
    });
  }
}
