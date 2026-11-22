import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IN_PROGRESS_LOCALES, PRODUCTION_LOCALES, UiLocale } from '../../i18n/locale';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { PostingLanguage } from '../../publishing/posting-language';
import { suggestedLanguages } from '../language-catalog';
import { LanguageFinderDialog } from '../language-finder/language-finder';
import { KnownLanguages } from '../trend-language-filter';

// i18n language.select.any: Any language
// i18n language.select.group.current: Chosen
// i18n language.select.group.yours: Your languages
// i18n language.select.group.app: Languages Mawkingbird is translated into
// i18n language.select.more: All languages…

const MORE = '__more__';

/** Literal keys, so the i18n checker sees each one. */
const GROUP_KEYS = {
  current: 'language.select.group.current',
  yours: 'language.select.group.yours',
  app: 'language.select.group.app',
} as const;

/**
 * The short language list (spec/moderation-facets.md §1): any, the reader's
 * own languages, then every language the app is translated into. Anything
 * else is one "All languages…" away, in the finder, never in this select.
 *
 * Wrap it in a `<label>` for its visible name, as with a native select.
 */
@Component({
  selector: 'app-language-select',
  imports: [TranslocoPipe, LanguageFinderDialog],
  template: `
    <select #select [value]="value()" (change)="choose(select.value, select)">
      <option value="" [selected]="!value()">
        {{ anyLabel() || ('language.select.any' | transloco) }}
      </option>
      @for (group of groups(); track group.kind) {
        <optgroup [label]="groupKeys[group.kind] | transloco">
          @for (l of group.options; track l.code) {
            <option [value]="l.code" [selected]="l.code === value()">
              {{ l.name }}{{ l.endonym ? ' · ' + l.endonym : '' }}
            </option>
          }
        </optgroup>
      }
      <option [value]="more">{{ 'language.select.more' | transloco }}</option>
    </select>
    @if (finderOpen()) {
      <app-language-finder-dialog (picked)="choose($event)" (closed)="finderOpen.set(false)" />
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class LanguageSelect {
  private readonly known = inject(KnownLanguages);
  private readonly prefs = inject(ClientPrefs);
  private readonly posting = inject(PostingLanguage);
  private readonly locale = inject(UiLocale);

  /** A bare language code, or '' for any. */
  readonly value = input('');
  /** Replaces "Any language" when the empty choice means something else. */
  readonly anyLabel = input('');
  readonly valueChange = output<string>();

  protected readonly more = MORE;
  protected readonly groupKeys = GROUP_KEYS;
  protected readonly finderOpen = signal(false);
  protected readonly groups = computed(() =>
    suggestedLanguages(
      this.value(),
      [...this.known.codes(), ...this.prefs.learningLanguages(), this.posting.default()],
      [...PRODUCTION_LOCALES, ...IN_PROGRESS_LOCALES],
      this.locale.active(),
    ),
  );

  protected choose(code: string, select?: HTMLSelectElement): void {
    if (code === MORE) {
      // The value never held the sentinel, so put the control back by hand.
      if (select) select.value = this.value();
      this.finderOpen.set(true);
      return;
    }
    this.valueChange.emit(code);
  }
}
