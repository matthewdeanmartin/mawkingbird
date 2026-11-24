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
 * Use {@link translatedComputed} for a derived value that calls `translate()`,
 * including calls made by nested helpers. It gives that computed the dependency
 * the imperative API does not, so the label recomputes when the words arrive:
 *
 *     protected readonly label = translatedComputed(
 *       () => this.transloco.translate(KEY),
 *     );
 *
 * where `KEY` is the usual key literal. (Spelled as a constant here only so
 * `scripts/check-i18n.mjs`, which scans sources for key references, does not
 * read this example as a real use of a key that has no English behind it.)
 *
 * Reading {@link TranslatedText.version} directly remains useful for other
 * reactive consumers. Template pipes (`| transloco`) already handle this and
 * need nothing. Data arriving later is not a substitute: native IPC or a local
 * cache can settle before a dictionary, and live language changes need their
 * own dependency regardless of data ordering.
 */

import { computed, CreateComputedOptions, inject, Injectable, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

type HashMap = Record<string, unknown>;

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

/**
 * A derived label that follows dictionary loading and live language changes.
 * Capturing the version in the injection context also covers translations made
 * by nested helpers, without making every helper depend on Angular or timers.
 * Call in an injection context, such as an injected class's field initializer.
 */
export function translatedComputed<T>(
  calculation: () => T,
  options?: CreateComputedOptions<T>,
): Signal<T> {
  const version = inject(TranslatedText).version;
  return computed(() => {
    version();
    return calculation();
  }, options);
}

/** A message held as its key, so it can be translated once the words arrive. */
export interface MessageRef {
  key: string;
  params?: HashMap;
}

/**
 * A writable message whose text follows the dictionary.
 *
 * Error paths are where {@link TranslatedText} matters most and is easiest to
 * forget: a fast failure (a refused connection, an instant 404) can land before
 * `i18n/{lang}.json` does, and a `translate()` stored into a plain signal then
 * keeps the raw key on screen. A shared link opened in a fresh browser showed
 * `pages.thread.error.loadPost` exactly this way. Hold the key instead:
 *
 *     readonly loadError = translatedMessage();
 *     this.loadError.set('pages.thread.error.loadPost');
 *     // template: {{ loadError() }}
 *
 * Call in an injection context. `set(null)` clears it.
 */
export function translatedMessage(): TranslatedMessage {
  const transloco = inject(TranslocoService);
  const version = inject(TranslatedText).version;
  const ref = signal<MessageRef | null>(null);
  const text = computed(() => {
    version();
    const current = ref();
    return current ? transloco.translate<string>(current.key, current.params) : null;
  });
  return Object.assign(text, {
    set(key: string | null, params?: HashMap): void {
      ref.set(key ? { key, params } : null);
    },
    ref: ref.asReadonly(),
  });
}

export type TranslatedMessage = Signal<string | null> & {
  set(key: string | null, params?: HashMap): void;
  readonly ref: Signal<MessageRef | null>;
};
