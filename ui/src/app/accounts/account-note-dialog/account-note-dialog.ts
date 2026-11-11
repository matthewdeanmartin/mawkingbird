import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Api } from '../../platform/api/api';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbNotice } from '../../design-system/notice/notice';
import { Relationship } from '../../platform/api/models';
import { describeHttpError } from '../../platform/diagnostics/page-diagnostics';

// i18n accountNote.title: Private note about @{{acct}}
// i18n accountNote.label: Note
// i18n accountNote.hint: Only you can see this. It is saved on your server, so it follows you to other apps.
// i18n accountNote.placeholder: Where you met, what they post about, anything to remember…
// i18n accountNote.cancel: Cancel
// i18n accountNote.save: Save note
// i18n accountNote.saving: Saving…
// i18n accountNote.clear: Delete note
// i18n accountNote.error: Could not save this note. {{detail}}

/** Mastodon caps account notes at 2,000 characters. */
export const ACCOUNT_NOTE_MAX = 2000;

/**
 * Create, change or clear the viewer's private note about another account
 * (`POST /api/v1/accounts/:id/note`). Emits the server's updated relationship.
 */
@Component({
  selector: 'app-account-note-dialog',
  imports: [MbDialog, MbField, MbControl, MbButton, MbNotice, FormsModule, TranslocoPipe],
  template: `
    <mb-dialog
      [title]="'accountNote.title' | transloco: { acct: acct() }"
      [closeLabel]="'accountNote.cancel' | transloco"
      [busy]="saving()"
      (dismissed)="closed.emit()"
    >
      <mb-field [label]="'accountNote.label' | transloco" [hint]="'accountNote.hint' | transloco">
        <textarea
          mbControl
          rows="5"
          [attr.maxlength]="max"
          [ngModel]="text()"
          (ngModelChange)="text.set($event)"
          [placeholder]="'accountNote.placeholder' | transloco"
        ></textarea>
      </mb-field>
      <p class="count muted small" aria-live="polite">{{ text().length }} / {{ max }}</p>
      @if (error()) {
        <mb-notice tone="error" announcement="alert">{{ error() }}</mb-notice>
      }
      <ng-container mbDialogActions>
        @if (initial()) {
          <button mbButton type="button" variant="outline" [disabled]="saving()" (click)="save('')">
            {{ 'accountNote.clear' | transloco }}
          </button>
        }
        <button mbButton type="button" variant="outline" (click)="closed.emit()">
          {{ 'accountNote.cancel' | transloco }}
        </button>
        <button
          mbButton
          type="button"
          [disabled]="saving() || text().trim() === initial().trim()"
          (click)="save(text())"
        >
          {{ (saving() ? 'accountNote.saving' : 'accountNote.save') | transloco }}
        </button>
      </ng-container>
    </mb-dialog>
  `,
  styles: `
    .count {
      margin: 4px 0 0;
      text-align: end;
      font-size: 13px;
    }
  `,
})
export class AccountNoteDialog implements OnInit {
  private readonly api = inject(Api);
  private readonly transloco = inject(TranslocoService);

  readonly accountId = input.required<string>();
  readonly acct = input.required<string>();
  /** The note as the server last returned it ('' when there is none). */
  readonly initial = input('');

  readonly closed = output<void>();
  readonly saved = output<Relationship>();

  protected readonly max = ACCOUNT_NOTE_MAX;
  protected readonly text = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.text.set(this.initial());
  }

  save(comment: string): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.setAccountNote(this.accountId(), comment.trim()).subscribe({
      next: (relationship) => {
        this.saving.set(false);
        this.saved.emit(relationship);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(
          this.transloco.translate('accountNote.error', { detail: describeHttpError(error) }),
        );
      },
    });
  }
}
