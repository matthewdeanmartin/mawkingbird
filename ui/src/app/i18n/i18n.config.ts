/**
 * Transloco wiring: where dictionaries come from, and what happens when a key
 * is missing from one.
 *
 * **Why runtime dictionaries rather than Angular's own `@angular/localize`.**
 * This app is a static SPA published to GitHub Pages at several base hrefs at
 * once — `/` (mawkingbird.com), `/canary/`, `/_ui/` under FastAPI, and assorted
 * test subpaths guarded by `scripts/check-subpath-deployments.mjs`. Angular's
 * built-in i18n compiles **one bundle per locale**, which would multiply that
 * matrix by the number of languages and force every subpath guard, 404 shim and
 * OAuth metadata stamp to become locale-aware. Fetching a JSON file at runtime
 * keeps one build, and makes a new language a file rather than a deployment.
 *
 * See sprint/ui-i18n-0-overview.md for the full reasoning.
 */

import { HttpClient } from '@angular/common/http';
import {
  EnvironmentProviders,
  inject,
  Injectable,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import {
  provideTransloco,
  Translation,
  TranslocoLoader,
  translocoConfig,
} from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { FALLBACK_LOCALE, SUPPORTED_LOCALES, TranslocoLocaleSync } from './locale';
import { externalFetch } from '../providers/external-fetch';

/**
 * Loads `i18n/{lang}.json` from the deployment's own base.
 *
 * **The base href is the whole subtlety here.** A hardcoded `/i18n/de.json`
 * works in `ng serve` and on mawkingbird.com, and 404s on `/canary/` and
 * `/_ui/` — where the failure is *silent*, because a missing dictionary
 * degrades to English rather than erroring. Nobody reports "the app is in
 * English"; they just don't get their language. Resolving against
 * `document.baseURI` is the same idiom `mastodon-servers.ts` uses for its
 * bundled data, for the same reason.
 */
@Injectable({ providedIn: 'root' })
export class HttpTranslocoLoader implements TranslocoLoader {
  private http = inject(HttpClient);

  getTranslation(lang: string): Observable<Translation> {
    const url = new URL(`i18n/${lang}.json`, document.baseURI).toString();
    return this.http.get<Translation>(url, { context: externalFetch() });
  }
}

export function provideI18n(): EnvironmentProviders[] {
  return provideTransloco({
    config: translocoConfig({
      availableLangs: [...SUPPORTED_LOCALES],
      defaultLang: FALLBACK_LOCALE,
      fallbackLang: FALLBACK_LOCALE,
      // Re-render on language change, so the picker switches the UI live
      // instead of demanding a reload.
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
      missingHandler: {
        // The load-bearing setting for this whole epic: a key absent from a
        // locale renders the **English string**, not the raw key. That is what
        // lets a feature ship in English the day it lands, with translations
        // catching up later, instead of every feature blocking on 60
        // translation rounds. A Finnish reader sees one English button; they
        // never see `settings.i18n.title` or an empty space.
        useFallbackTranslation: true,
        // Don't log a warning per missing key in production: with coverage
        // deliberately incomplete, that would be thousands of console lines
        // describing a state we chose on purpose.
        logMissingKey: isDevMode(),
        allowEmpty: false,
      },
    }),
    loader: HttpTranslocoLoader,
  });
}

/**
 * Everything the running app needs for translation.
 *
 * `provideI18n` is split from the locale sync so unit tests can take the
 * dictionary without the bootstrap wiring: instantiating
 * {@link TranslocoLocaleSync} is what makes the picker actually change the
 * rendered language, and it is the only place `UiLocale` and `TranslocoService`
 * meet. See the note on `UiLocale` for why they are kept apart.
 */
export function provideI18nForApp(): EnvironmentProviders[] {
  return [
    ...provideI18n(),
    provideAppInitializer(() => {
      inject(TranslocoLocaleSync);
    }),
  ];
}
