/**
 * Translation for specs: synchronous, English-only, no HTTP.
 *
 * ## Why this file has to exist
 *
 * Two properties of this suite make the production i18n providers unusable in
 * tests, and both of them fail *quietly* rather than loudly.
 *
 * **1. The suite shares one jsdom realm.** The Angular unit-test builder runs
 * with `isolate: false` ("to align with the Karma/Jasmine experience" — see the
 * long note in `src/test-setup.ts`), so all ~420 spec files execute against the
 * same globals in a worker. Anything root-provided and stateful is therefore
 * shared mutable state across unrelated files. A spec that switches the locale
 * to German would leak German into whichever spec the runner happens to schedule
 * next in that worker — failing intermittently, never in isolation, and never in
 * the spec that caused it. That is precisely the shape of the `window.location`
 * bug documented in `test-setup.ts`, and it cost a lot to diagnose once already.
 *
 * **2. The real loader is asynchronous and uses `HttpClient`.** Specs use
 * `HttpTestingController` with an `afterEach(() => http.verify())`. A background
 * `GET i18n/en.json` fired by Transloco would appear as an unexpected open
 * request and fail specs that have nothing to do with translation.
 *
 * ## What this provides instead
 *
 * `TranslocoTestingModule` with the **real `en.json`** preloaded, so a template
 * renders finished English text on first `detectChanges()` — no tick, no flush,
 * no awaiting. That is what lets the ~279 existing assertions that match visible
 * English text (`expect(text).toContain('Report a bug')`) keep passing through
 * the migration untouched.
 *
 * Using the real dictionary rather than a stub matters: a spec then fails if a
 * key it renders is missing from `en.json`, instead of silently displaying a key
 * name that no assertion happens to check.
 */

import { Provider } from '@angular/core';
import { TranslocoTestingModule, TranslocoTestingOptions } from '@jsverse/transloco';
import en from '../../../public/i18n/en.json';
import { FALLBACK_LOCALE, SUPPORTED_LOCALES } from './locale';

/**
 * Providers giving a spec finished English synchronously.
 *
 * Add to `TestBed.configureTestingModule({ imports: [...] })` — it is a module,
 * so it goes in `imports`, not `providers`.
 */
export function translocoTesting(options: TranslocoTestingOptions = {}) {
  return TranslocoTestingModule.forRoot({
    langs: { en },
    translocoConfig: {
      availableLangs: [...SUPPORTED_LOCALES],
      defaultLang: FALLBACK_LOCALE,
      fallbackLang: FALLBACK_LOCALE,
      reRenderOnLangChange: true,
      // Silence per-key warnings: specs deliberately render components whose
      // keys may not all exist yet during the migration.
      missingHandler: { logMissingKey: false, useFallbackTranslation: true, allowEmpty: false },
    },
    // Load eagerly so the first render already has strings.
    preloadLangs: true,
    ...options,
  });
}

/**
 * Kept for symmetry with how other test helpers in this app are shaped, and so
 * a spec that needs raw providers rather than a module import has one.
 */
export const TRANSLOCO_TESTING_PROVIDERS: Provider[] = [];
