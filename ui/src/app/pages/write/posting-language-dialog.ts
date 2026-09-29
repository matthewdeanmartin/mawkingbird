import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbField, MbControl } from '../../design-system/field/field';
import { MbButton } from '../../design-system/button/button';
import { POSTING_LANGUAGE_OPTIONS } from '../../language-detect';
import { PostingLanguage } from '../../posting-language';

// i18n write.language.title: What language do you usually write in?
// i18n write.language.hint: Choose a default for new posts in this browser. You can still choose a different language, or Not specified, for an individual post.
// i18n write.language.label: Posting language
// i18n write.language.other: Other language or language tag…
// i18n write.language.code: Language code
// i18n write.language.codeHint: For example: zu (Zulu), tlh (Klingon), tok (Toki Pona), or a full tag such as zh-Hant.
// i18n write.language.later: Not now
// i18n write.language.save: Use this language
// i18n write.language.postTitle: Choose this post's language
// i18n write.language.postHint: Choose a language for this post. Your default stays the same.
@Component({
  selector: 'app-posting-language-dialog',
  imports: [FormsModule, TranslocoPipe, MbDialog, MbField, MbControl, MbButton],
  template: `
    <mb-dialog
      [title]="(setDefault() ? 'write.language.title' : 'write.language.postTitle') | transloco"
      [description]="(setDefault() ? 'write.language.hint' : 'write.language.postHint') | transloco"
      [closeLabel]="'write.language.later' | transloco"
      (dismissed)="dismiss()"
    >
      <mb-field [label]="'write.language.label' | transloco">
        <select mbControl [ngModel]="selected()" (ngModelChange)="selected.set($event)">
          @for (language of options; track language.code) {
            <option [value]="language.code">{{ language.name }}</option>
          }
          <option value="other">{{ 'write.language.other' | transloco }}</option>
        </select>
      </mb-field>
      @if (selected() === 'other') {
        <mb-field
          [label]="'write.language.code' | transloco"
          [hint]="'write.language.codeHint' | transloco"
        >
          <input mbControl type="text" [ngModel]="custom()" (ngModelChange)="custom.set($event)" />
        </mb-field>
      }
      <button mbDialogActions mbButton type="button" [disabled]="!valid()" (click)="save()">
        {{ 'write.language.save' | transloco }}
      </button>
    </mb-dialog>
  `,
  styles: `
    mb-field + mb-field {
      margin-top: 16px;
    }
  `,
})
export class PostingLanguageDialog {
  readonly setDefault = input(true);
  private readonly language = inject(PostingLanguage);
  readonly selectedLanguage = output<string>();
  readonly closed = output<void>();
  protected readonly options = [
    ...POSTING_LANGUAGE_OPTIONS,
    { code: 'zu', name: 'Zulu' },
    { code: 'tlh', name: 'Klingon' },
    { code: 'tok', name: 'Toki Pona' },
  ]
    .filter((item, index, all) => all.findIndex((other) => other.code === item.code) === index)
    .sort((a, b) => a.name.localeCompare(b.name));
  protected readonly selected = signal(
    this.options.some((item) => item.code === this.language.default())
      ? this.language.default()
      : 'other',
  );
  protected readonly custom = signal(this.language.default());
  protected readonly value = computed(() =>
    (this.selected() === 'other' ? this.custom() : this.selected()).trim(),
  );
  protected readonly valid = computed(() => /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(this.value()));
  protected save(): void {
    if (!this.valid()) return;
    if (this.setDefault()) this.language.choose(this.value());
    this.selectedLanguage.emit(this.value());
    this.closed.emit();
  }
  protected dismiss(): void {
    if (this.setDefault()) this.language.dismiss();
    this.closed.emit();
  }
}
