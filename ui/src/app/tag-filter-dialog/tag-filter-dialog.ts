import { Component, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../api';
import { Auth } from '../auth';
import { Server } from '../server';
import { FilterAction, FilterContext } from '../models';
import { MbDialog } from '../design-system/dialog/dialog';
import { MbButton } from '../design-system/button/button';
import { MbControl, MbField } from '../design-system/field/field';
import { MbCheckbox } from '../design-system/checkbox/checkbox';
import { normalizeHashtag } from '../hashtag';

// i18n tagFilter.title: Mute #{{tag}}
// i18n tagFilter.hint: Create a keyword filter on your current Mastodon account. Choose where it applies and when it expires. Refresh loaded feeds after saving to see the server's filter results.
// i18n tagFilter.failed: Couldn't create the filter. Your choices are still here; try again.
// i18n tagFilter.saving: Creating filter…
// i18n tagFilter.expiry: Filter expires
@Component({
  selector: 'app-tag-filter-dialog',
  imports: [FormsModule, TranslocoPipe, MbDialog, MbButton, MbField, MbControl, MbCheckbox],
  template: ` <mb-dialog
    [title]="'tagFilter.title' | transloco: { tag: tag() }"
    [closeLabel]="'common.cancel' | transloco"
    [description]="'tagFilter.hint' | transloco"
    [busy]="saving()"
    (dismissed)="finish()()"
  >
    <mb-field [label]="'settings.filters.titleLabel' | transloco">
      <input mbControl [ngModel]="title()" (ngModelChange)="title.set($event)" />
    </mb-field>
    <mb-field [label]="'settings.filters.keywords' | transloco">
      <input mbControl [ngModel]="keyword()" (ngModelChange)="keyword.set($event)" />
    </mb-field>
    <mb-checkbox
      [label]="'settings.filters.wholeWord' | transloco"
      [checked]="wholeWord()"
      (checkedChange)="wholeWord.set($event)"
    />
    <fieldset>
      <legend>{{ 'settings.filters.contexts' | transloco }}</legend>
      @for (context of contextOptions; track context) {
        <mb-checkbox
          [label]="'settings.filters.context.' + context | transloco"
          [checked]="contexts().includes(context)"
          (checkedChange)="setContext(context, $event)"
        />
      }
    </fieldset>
    <mb-field [label]="'settings.filters.action' | transloco">
      <select mbControl [ngModel]="action()" (ngModelChange)="action.set($event)">
        <option value="hide">{{ 'settings.filters.action.hide' | transloco }}</option>
        <option value="warn">{{ 'settings.filters.action.warn' | transloco }}</option>
      </select>
    </mb-field>
    <mb-field [label]="'tagFilter.expiry' | transloco">
      <select mbControl [ngModel]="expires()" (ngModelChange)="expires.set($event)">
        @for (option of expiryOptions; track option.key) {
          <option [ngValue]="option.value">
            {{ 'settings.filters.expiry.' + option.key | transloco }}
          </option>
        }
      </select>
    </mb-field>
    @if (error()) {
      <p role="alert">{{ error() | transloco }}</p>
    }
    <div mbDialogActions>
      <button mbButton type="button" variant="outline" [disabled]="saving()" (click)="finish()()">
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        mbButton
        type="button"
        [disabled]="saving() || !title().trim() || !keyword().trim() || !contexts().length"
        (click)="save()"
      >
        {{ (saving() ? 'tagFilter.saving' : 'settings.filters.create') | transloco }}
      </button>
    </div>
  </mb-dialog>`,
})
export class TagFilterDialog {
  readonly tag = input.required<string>();
  readonly finish = input.required<() => void>();
  private api = inject(Api);
  private auth = inject(Auth);
  private server = inject(Server);
  private destroyRef = inject(DestroyRef);
  protected title = linkedSignal(() => '#' + this.tag());
  protected keyword = linkedSignal(() => '#' + this.tag());
  protected wholeWord = signal(true);
  protected contexts = signal<FilterContext[]>(['home']);
  protected action = signal<FilterAction>('hide');
  protected expires = signal<number | null>(null);
  protected saving = signal(false);
  protected error = signal('');
  protected contextOptions: FilterContext[] = [
    'home',
    'notifications',
    'public',
    'thread',
    'account',
  ];
  protected expiryOptions = [
    { value: null, key: 'never' },
    { value: 1800, key: 'min30' },
    { value: 3600, key: 'hour1' },
    { value: 21600, key: 'hour6' },
    { value: 43200, key: 'hour12' },
    { value: 86400, key: 'day1' },
    { value: 604800, key: 'week1' },
  ];
  constructor() {
    let identity: string | undefined;
    effect(() => {
      const next = `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
      if (identity !== undefined && next !== identity) this.finish()();
      identity = next;
    });
  }
  protected setContext(context: FilterContext, checked: boolean): void {
    this.contexts.update((list) =>
      checked ? [...new Set([...list, context])] : list.filter((item) => item !== context),
    );
  }
  protected save(): void {
    if (
      this.saving() ||
      !normalizeHashtag(this.tag()) ||
      this.auth.kind() !== 'mastodon' ||
      !this.title().trim() ||
      !this.keyword().trim() ||
      !this.contexts().length
    )
      return;
    this.error.set('');
    this.saving.set(true);
    this.api
      .createFilter({
        title: this.title().trim(),
        context: this.contexts(),
        filter_action: this.action(),
        expires_in: this.expires(),
        keywords_attributes: [{ keyword: this.keyword().trim(), whole_word: this.wholeWord() }],
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.finish()(),
        error: () => {
          this.saving.set(false);
          this.error.set('tagFilter.failed');
        },
      });
  }
}
