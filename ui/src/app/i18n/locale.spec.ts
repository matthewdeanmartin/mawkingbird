import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientPrefs } from '../client-prefs';
import {
  FALLBACK_LOCALE,
  negotiateLocale,
  SUPPORTED_LOCALES,
  supportedLocales,
  SupportedLocale,
  TranslocoLocaleSync,
  UiLocale,
} from './locale';

describe('TranslocoLocaleSync', () => {
  it('updates the document language on bootstrap and on live locale changes', () => {
    const active = signal<SupportedLocale>('zh-Hant');
    const page = document.implementation.createHTMLDocument();
    page.documentElement.lang = 'en';
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: page },
        { provide: UiLocale, useValue: { active } },
      ],
    });
    const transloco = TestBed.inject(TranslocoService);
    vi.spyOn(transloco, 'getActiveLang').mockReturnValue('zh-Hant');
    const setActiveLang = vi.spyOn(transloco, 'setActiveLang').mockReturnValue(transloco);
    TestBed.inject(TranslocoLocaleSync);
    TestBed.tick();
    expect(page.documentElement.lang).toBe('zh-Hant');
    expect(setActiveLang).not.toHaveBeenCalled();
    active.set('en');
    TestBed.tick();
    expect(page.documentElement.lang).toBe('en');
    expect(setActiveLang).toHaveBeenCalledWith('en');
  });
});

describe('supportedLocales', () => {
  const shipped = [
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
  ];

  it('ships every translated locale to the production root', () => {
    expect(supportedLocales('https://mawkingbird.com/')).toEqual(shipped);
  });

  it('offers the same set on test and canary deployments', () => {
    const reviewLocales = [...shipped, 'vi', 'hi', 'sv'];
    expect(supportedLocales('https://mawkingbird.com/test/')).toEqual(reviewLocales);
    expect(supportedLocales('https://mawkingbird.com/canary/')).toEqual(reviewLocales);
    expect(supportedLocales('https://example.github.io/mawkingbird/canary/')).toEqual(
      reviewLocales,
    );
  });

  it('negotiates a production visitor into their browser language', () => {
    // The point of the promotion: a reader whose browser asks for German gets
    // German at the root, not only on a review build.
    const production = supportedLocales('https://mawkingbird.com/');
    expect(negotiateLocale(['de-AT', 'en'], production)).toBe('de');
    expect(negotiateLocale(['tr'], production)).toBe('tr');
    expect(negotiateLocale(['ru-RU'], production)).toBe('ru');
  });
});

/**
 * Replace `navigator.languages` for one test, and put it back afterwards.
 *
 * The suite shares a jsdom realm (see `src/test-setup.ts`), so a value left
 * behind here leaks into every spec that runs after it. That used to be
 * harmless — with only `en` shipped, any browser chain negotiated to English —
 * but promoting the translated locales to production made the negotiation real,
 * and a leaked `de-DE` turned `KnownLanguages` German for the trend-filter
 * suite. Restoring is no longer optional, so the helper owns it rather than
 * trusting each test to remember.
 */
let originalLanguages: PropertyDescriptor | undefined;

afterEach(() => {
  if (originalLanguages) {
    Object.defineProperty(navigator, 'languages', originalLanguages);
  } else {
    delete (navigator as { languages?: unknown }).languages;
  }
  originalLanguages = undefined;
});

function setBrowserLanguages(languages: string[]): void {
  originalLanguages ??= Object.getOwnPropertyDescriptor(navigator, 'languages');
  Object.defineProperty(navigator, 'languages', {
    value: languages,
    configurable: true,
  });
}

describe('negotiateLocale', () => {
  const reviewLocales = supportedLocales('https://mawkingbird.com/test/');

  it.each(['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO', 'zh_Hant_TW', 'ZH-tw', 'zh-Hant-CN'])(
    'negotiates Traditional Chinese for %s on review builds',
    (tag) => expect(negotiateLocale([tag], reviewLocales)).toBe('zh-Hant'),
  );

  it.each(['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-TW', 'zh-Latn-TW', '???'])(
    'does not coerce %s into Traditional Chinese',
    (tag) => expect(negotiateLocale([tag], reviewLocales)).toBe('en'),
  );

  it('honours browser order and deployment availability for Chinese', () => {
    // The browser's own order decides: the first tag we ship wins, so a reader
    // asking for Simplified first still gets whatever they asked for next.
    expect(negotiateLocale(['zh-Hans', 'fr-FR', 'zh-TW'], reviewLocales)).toBe('fr');
    expect(negotiateLocale(['zh-Hans', 'zh-TW'], reviewLocales)).toBe('zh-Hant');
    expect(negotiateLocale(['en', 'zh-TW'], reviewLocales)).toBe('en');
    // A build that ships only English has nothing to negotiate into.
    expect(negotiateLocale(['zh-TW'], ['en'])).toBe('en');
  });

  it('falls back to English when the browser wants nothing we ship', () => {
    // Swedish has an endonym but no dictionary, so it is not negotiable.
    expect(negotiateLocale(['sv-SE', 'sv'])).toBe(FALLBACK_LOCALE);
    expect(negotiateLocale(['fr-FR', 'fr'], ['en'])).toBe(FALLBACK_LOCALE);
  });

  it('matches on the bare tag, so regional variants resolve', () => {
    // A build shipping only `en` must still recognise en-GB as English rather
    // than treating it as an unknown language.
    expect(negotiateLocale(['en-GB'])).toBe('en');
    expect(negotiateLocale(['en_US'])).toBe('en');
  });

  it('takes the browser’s first supported entry, not the first entry', () => {
    expect(negotiateLocale(['zz', 'en-GB'])).toBe('en');
  });

  it('falls back on an empty chain', () => {
    expect(negotiateLocale([])).toBe(FALLBACK_LOCALE);
  });
});

describe('UiLocale', () => {
  beforeEach(() => {
    localStorage.clear();
    setBrowserLanguages(['en-US']);
  });

  it('is automatic when nothing has been chosen', () => {
    const locale = TestBed.inject(UiLocale);
    expect(locale.isAutomatic()).toBe(true);
    expect(locale.active()).toBe('en');
  });

  it('reports a stored choice as not automatic', () => {
    TestBed.inject(ClientPrefs).uiLocale.set('en');
    const locale = TestBed.inject(UiLocale);
    expect(locale.isAutomatic()).toBe(false);
    expect(locale.active()).toBe('en');
  });

  it('ignores a stored locale this build does not ship', () => {
    // A locale chosen on a newer build, or hand-edited into storage, must not
    // strand the reader on a dictionary that isn't here: fall through to
    // negotiation rather than rendering nothing.
    TestBed.inject(ClientPrefs).uiLocale.set('xx');
    const locale = TestBed.inject(UiLocale);
    expect(locale.active()).toBe(FALLBACK_LOCALE);
    expect(locale.isAutomatic()).toBe(true);
  });

  it('choose(null) hands the decision back to the browser', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const locale = TestBed.inject(UiLocale);
    locale.choose('en');
    expect(locale.isAutomatic()).toBe(false);
    locale.choose(null);
    expect(prefs.uiLocale()).toBeNull();
    expect(locale.isAutomatic()).toBe(true);
  });

  it('does not persist a negotiated locale', () => {
    // The load-bearing rule: persisting the browser's guess would silently turn
    // it into an explicit choice, freezing a reader who later changes their OS
    // language onto the old one with nothing in the UI to explain why.
    const prefs = TestBed.inject(ClientPrefs);
    const locale = TestBed.inject(UiLocale);
    expect(locale.active()).toBe('en');
    expect(prefs.uiLocale()).toBeNull();
  });

  it('hides the picker while only one locale ships', () => {
    // Guards the footer against a one-option language menu. This expectation
    // flips in ui-i18n-7, when SUPPORTED_LOCALES grows.
    const locale = TestBed.inject(UiLocale);
    expect(locale.hasChoice).toBe(SUPPORTED_LOCALES.length > 1);
  });
});

describe('an explicit choice survives the browser disagreeing', () => {
  it('keeps the stored locale when navigator prefers another', () => {
    localStorage.clear();
    setBrowserLanguages(['de-DE', 'de']);
    TestBed.inject(ClientPrefs).uiLocale.set('en');
    expect(TestBed.inject(UiLocale).active()).toBe('en');
  });
});
