import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbButton } from '../../design-system/button/button';
import { UiLocale } from '../../i18n/locale';
import { LanguageOption, searchLanguages } from '../language-catalog';

// i18n language.finder.label: Find a language
// i18n language.finder.placeholder: Type a name or code, e.g. Malay, Melayu, ms
// i18n language.finder.hint: Every language a post can be tagged with. Names work in your language, in the language itself, or in English.
// i18n language.finder.none: No language matches “{{query}}”.
// i18n language.finder.title: All languages
// i18n language.finder.cancel: Cancel

let nextId = 0;

/**
 * Type-to-find over every language a post can carry (spec/moderation-facets.md
 * §1). A combobox, deliberately not a select: it never renders more than a
 * dozen rows, however many languages exist.
 */
@Component({
  selector: 'app-language-finder',
  imports: [TranslocoPipe],
  template: `
    <label class="finder-label" [for]="inputId">{{ 'language.finder.label' | transloco }}</label>
    <input
      [id]="inputId"
      class="finder-input"
      type="search"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      [attr.aria-expanded]="matches().length > 0"
      [attr.aria-controls]="listId"
      [attr.aria-activedescendant]="activeId()"
      [attr.aria-describedby]="hintId"
      [placeholder]="'language.finder.placeholder' | transloco"
      [value]="query()"
      (input)="onInput($event)"
      (keydown)="onKey($event)"
    />
    <p class="muted small" [id]="hintId">{{ 'language.finder.hint' | transloco }}</p>
    <ul
      class="finder-list"
      role="listbox"
      [id]="listId"
      [attr.aria-label]="'language.finder.label' | transloco"
    >
      @for (option of matches(); track option.code; let i = $index) {
        <li
          role="option"
          [id]="listId + '-' + i"
          [attr.aria-selected]="i === active()"
          [class.active]="i === active()"
          (mousedown)="$event.preventDefault()"
          tabindex="-1"
          (click)="choose(option)"
          (keydown.enter)="choose(option)"
          (mouseenter)="active.set(i)"
        >
          <span class="name">{{ option.name }}</span>
          @if (option.endonym) {
            <span class="endonym" [attr.lang]="option.code">{{ option.endonym }}</span>
          }
          <code class="code">{{ option.code }}</code>
        </li>
      }
    </ul>
    @if (query().trim() && !matches().length) {
      <p class="muted small" role="status">
        {{ 'language.finder.none' | transloco: { query: query().trim() } }}
      </p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
    }
    .finder-label {
      display: block;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .finder-input {
      width: 100%;
      box-sizing: border-box;
    }
    .finder-list {
      list-style: none;
      margin: 8px 0 0;
      padding: 0;
    }
    .finder-list li {
      display: flex;
      gap: 8px;
      align-items: baseline;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
    }
    .finder-list li.active {
      background: var(--hover);
    }
    .endonym {
      color: var(--muted);
    }
    .code {
      margin-left: auto;
      font-size: 0.85em;
      opacity: 0.75;
    }
  `,
})
export class LanguageFinder {
  private readonly locale = inject(UiLocale);
  /** At most this many rows; the finder is for typing, not browsing. */
  readonly limit = input(12);
  readonly picked = output<string>();

  protected readonly inputId = `lang-finder-${++nextId}`;
  protected readonly listId = `${this.inputId}-list`;
  protected readonly hintId = `${this.inputId}-hint`;
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly matches = computed<LanguageOption[]>(() =>
    searchLanguages(this.query(), this.locale.active(), this.limit()),
  );
  protected readonly activeId = computed(() =>
    this.matches().length ? `${this.listId}-${this.active()}` : null,
  );

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.matches().length;
    if (!count) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.active.set((this.active() + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.active.set((this.active() - 1 + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.choose(this.matches()[this.active()]);
    }
  }

  protected choose(option: LanguageOption): void {
    this.picked.emit(option.code);
  }
}

/** The finder in a dialog, for "All languages…" entries in short selects. */
@Component({
  selector: 'app-language-finder-dialog',
  imports: [TranslocoPipe, MbDialog, MbButton, LanguageFinder],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <mb-dialog
      [title]="'language.finder.title' | transloco"
      [closeLabel]="'language.finder.cancel' | transloco"
      (dismissed)="closed.emit()"
    >
      <app-language-finder (picked)="pick($event)" />
      <button mbDialogActions mbButton type="button" variant="outline" (click)="closed.emit()">
        {{ 'language.finder.cancel' | transloco }}
      </button>
    </mb-dialog>
  `,
})
export class LanguageFinderDialog {
  readonly picked = output<string>();
  readonly closed = output<void>();

  protected pick(code: string): void {
    this.picked.emit(code);
    this.closed.emit();
  }
}
