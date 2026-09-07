/**
 * A signal that changes whenever the loaded dictionary does.
 *
 * ## The bug this exists to prevent
 *
 * `TranslocoService.translate()` is a plain synchronous function, not a signal.
 * Read it inside a `computed()` and Angular records **no** dependency on the
 * dictionary — only on whatever other signals that computed happens to touch.
 *
 * In production the loader fetches `i18n/{lang}.json` over HTTP, so the first
 * paint happens with the dictionary still in flight. `translate()` then returns
 * the key itself, and the `computed()` caches that string until one of its real
 * dependencies changes. For a computed built only from state that has already
 * settled — local preferences, a bound input — nothing ever does, so the raw
 * key stays on screen for the life of the page. That is how
 * `feedLanguagePicker.myLanguages` shipped as a visible label.
 *
 * Specs cannot catch this on their own: `i18n.testing.ts` preloads `en.json`
 * synchronously, precisely so templates render finished English on the first
 * `detectChanges()`. Every `translate()` in a spec therefore hits a populated
 * dictionary and the ordering that breaks production never occurs.
 *
 * ## Using it
 *
 * Read {@link TranslatedText.version} anywhere inside a `computed()` that calls
 * `translate()`. It gives that computed the dependency the imperative API does
 * not, so the label recomputes when the words arrive:
 *
 *     private i18n = inject(TranslatedText);
 *
 *     protected readonly label = computed(() => {
 *       this.i18n.version();
 *       return this.transloco.translate(KEY);
 *     });
 *
 * where `KEY` is the usual key literal. (Spelled as a constant here only so
 * `scripts/check-i18n.mjs`, which scans sources for key references, does not
 * read this example as a real use of a key that has no English behind it.)
 *
 * Template pipes (`| transloco`) already handle this themselves and need
 * nothing. So does a computed whose other dependencies are guaranteed to change
 * after load — an HTTP result, a route param — but relying on that is relying
 * on an accident of ordering, and this is one line.
 */

import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class TranslatedText {
  private transloco = inject(TranslocoService);

  private readonly tick = signal(0);

  /** Increments on every dictionary load and language change. */
  readonly version = this.tick.asReadonly();

  constructor() {
    this.transloco.events$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'translationLoadSuccess' || event.type === 'langChanged') {
        this.tick.update((n) => n + 1);
      }
    });
  }
}
