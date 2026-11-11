import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Api } from '../../api';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbNotice } from '../../design-system/notice/notice';
import { LANG_NAMES, LangCode } from '../../language-detect';
import { Account, Relationship } from '../../models';
import { describeHttpError } from '../../page-diagnostics';
import { KnownLanguages } from '../../trend-language-filter';

// i18n pages.profile.followLanguages.open: Languages you see from them…
// i18n pages.profile.followLanguages.title: Languages from {{name}}
// i18n pages.profile.followLanguages.intro: Only their posts in the languages you tick reach your Home. Their profile still shows everything. Tick none to see every language.
// i18n pages.profile.followLanguages.all: Every language (nothing ticked)
// i18n pages.profile.followLanguages.save: Save
// i18n pages.profile.followLanguages.cancel: Cancel
// i18n pages.profile.followLanguages.failed: Not saved. {{detail}}

/**
 * Mastodon's "Change subscribed languages": re-follow with `languages[]` so
 * Home only gets this person's posts in those languages. Done by the server,
 * so it holds on every app.
 */
@Component({
  selector: 'app-follow-languages-dialog',
  imports: [MbButton, MbCheckbox, MbDialog, MbNotice, TranslocoPipe],
  template: `
    <mb-dialog
      [title]="'pages.profile.followLanguages.title' | transloco: { name: displayName() }"
      [closeLabel]="'pages.profile.followLanguages.cancel' | transloco"
      [busy]="saving()"
      (dismissed)="close()"
    >
      <p class="muted small">{{ 'pages.profile.followLanguages.intro' | transloco }}</p>
      <div class="follow-languages">
        @for (option of options(); track option.code) {
          <mb-checkbox
            [label]="option.name"
            [checked]="chosen().has(option.code)"
            (checkedChange)="toggle(option.code, $event)"
          />
        }
      </div>
      @if (!chosen().size) {
        <p class="muted small">{{ 'pages.profile.followLanguages.all' | transloco }}</p>
      }
      @if (error()) {
        <mb-notice tone="error" announcement="alert">{{ error() }}</mb-notice>
      }
      <ng-container mbDialogActions>
        <button mbButton variant="outline" type="button" [disabled]="saving()" (click)="close()">
          {{ 'pages.profile.followLanguages.cancel' | transloco }}
        </button>
        <button mbButton type="button" [disabled]="saving()" (click)="save()">
          {{ 'pages.profile.followLanguages.save' | transloco }}
        </button>
      </ng-container>
    </mb-dialog>
  `,
  styles: `
    .follow-languages {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
      gap: 4px 12px;
    }
  `,
})
export class FollowLanguagesDialog implements OnInit {
  private readonly api = inject(Api);
  private readonly transloco = inject(TranslocoService);
  private readonly knownLanguages = inject(KnownLanguages);

  readonly account = input.required<Account>();
  readonly relationship = input.required<Relationship>();
  readonly saved = output<Relationship>();
  readonly closed = output<void>();

  protected readonly chosen = signal<Set<string>>(new Set());
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly displayName = computed(
    () => this.account().display_name || this.account().username,
  );
  /** The reader's languages plus any already chosen, so a choice never vanishes. */
  protected readonly options = computed(() =>
    [...new Set([...this.knownLanguages.codes(), ...(this.relationship().languages ?? [])])]
      .filter(Boolean)
      .map((code) => ({ code, name: LANG_NAMES[code as LangCode] ?? code.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  ngOnInit(): void {
    this.chosen.set(new Set(this.relationship().languages ?? []));
  }

  protected toggle(code: string, on: boolean): void {
    const next = new Set(this.chosen());
    if (on) next.add(code);
    else next.delete(code);
    this.chosen.set(next);
  }

  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected save(): void {
    const languages = this.chosen().size ? [...this.chosen()].sort() : null;
    this.saving.set(true);
    this.error.set('');
    this.api
      .follow(this.account().id, {
        reblogs: this.relationship().showing_reblogs !== false,
        languages,
      })
      .subscribe({
        next: (rel) => {
          this.saving.set(false);
          this.saved.emit(rel);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(
            this.transloco.translate('pages.profile.followLanguages.failed', {
              detail: describeHttpError(error),
            }),
          );
        },
      });
  }
}
