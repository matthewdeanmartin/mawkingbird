import { Injectable, Provider, Signal, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TRANSLOCO_LANG, translateSignal } from '@jsverse/transloco';

type Params = Record<string, unknown>;

/**
 * The language the current public page is written in, when it declares one.
 *
 * A page written for German readers is German for everyone who opens it, so on
 * such a page `<html lang>` follows the page, not the interface language.
 * `Seo` sets this on every navigation (null for pages that declare nothing,
 * and for the signed-in shell, where the interface language owns the
 * document); `TranslocoLocaleSync` writes `<html lang>` from it.
 */
@Injectable({ providedIn: 'root' })
export class PageLanguageState {
  readonly lang = signal<string | null>(null);
}

/**
 * Component providers for a page whose route names a language (`data.lang`):
 * every translate pipe inside it, dialogs included, renders in that language
 * for every visitor, without touching the app-wide interface language.
 *
 * Pinned with `|static`: a plain provided language is used for the first
 * render only, after which Transloco follows the app-wide language again. An
 * English page provides nothing and keeps today's behaviour, the interface
 * language.
 */
export function provideRouteLanguage(): Provider {
  return {
    provide: TRANSLOCO_LANG,
    useFactory: () => {
      const lang = inject(ActivatedRoute).snapshot.data['lang'] as string | undefined;
      return lang && lang !== 'en' ? `${lang}|static` : null;
    },
  };
}

/** The language a component's route pins, for code that calls `translate()` directly. */
export function routeLanguage(): string | undefined {
  const pinned = inject(TRANSLOCO_LANG, { optional: true });
  return pinned ? pinned.split('|')[0] : undefined;
}

/**
 * A translation for text built in code, in the route's pinned language when
 * there is one, the interface language otherwise. Reactive: the dictionary
 * loads on demand and `params` may be a signal. Call in an injection context.
 */
export function routeTranslate(key: string, params?: Params | Signal<Params>): Signal<string> {
  return translateSignal(key, params, routeLanguage());
}
