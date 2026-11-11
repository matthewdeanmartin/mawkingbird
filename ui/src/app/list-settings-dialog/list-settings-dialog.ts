import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Api } from '../api';
import { MbButton } from '../design-system/button/button';
import { MbDialog } from '../design-system/dialog/dialog';
import { MbControl, MbField } from '../design-system/field/field';
import { MbNotice } from '../design-system/notice/notice';
import { MbRadioGroup, RadioOption } from '../design-system/radio-group/radio-group';
import { LIST_REPLIES_POLICIES, ListRepliesPolicy, UserList } from '../models';
import { describeHttpError } from '../page-diagnostics';

// i18n listSettings.title: Edit list
// i18n listSettings.name: Name
// i18n listSettings.repliesPolicy: Replies in this list
// i18n listSettings.repliesPolicyHint: When a list member replies to someone, should the reply appear in this list?
// i18n listSettings.policy.list: Replies to other list members
// i18n listSettings.policy.listHint: A conversation between people on this list. The default.
// i18n listSettings.policy.followed: Replies to anyone you follow
// i18n listSettings.policy.followedHint: Also shows list members talking to people you follow outside the list.
// i18n listSettings.policy.none: No replies
// i18n listSettings.policy.noneHint: Only original posts and boosts from list members.
// i18n listSettings.cancel: Cancel
// i18n listSettings.save: Save
// i18n listSettings.saving: Saving…
// i18n listSettings.nameRequired: A list needs a name.
// i18n listSettings.error: Could not save this list. {{detail}}

/** Radio options for a Mastodon list's reply policy, in the server's default-first order. */
export function repliesPolicyOptions(transloco: TranslocoService): RadioOption[] {
  return LIST_REPLIES_POLICIES.map((value) => ({
    value,
    label: transloco.translate(`listSettings.policy.${value}`),
    hint: transloco.translate(`listSettings.policy.${value}Hint`),
  }));
}

/**
 * Rename a server-side Mastodon list and choose its reply policy. Exclusivity
 * and membership are preserved: see {@link Api.editList}.
 */
@Component({
  selector: 'app-list-settings-dialog',
  imports: [
    MbDialog,
    MbField,
    MbControl,
    MbButton,
    MbNotice,
    MbRadioGroup,
    FormsModule,
    TranslocoPipe,
  ],
  template: `
    <mb-dialog
      [title]="'listSettings.title' | transloco"
      [closeLabel]="'listSettings.cancel' | transloco"
      [busy]="saving()"
      (dismissed)="closed.emit()"
    >
      <mb-field [label]="'listSettings.name' | transloco">
        <input
          mbControl
          type="text"
          maxlength="100"
          [ngModel]="title()"
          (ngModelChange)="title.set($event)"
          (keyup.enter)="save()"
        />
      </mb-field>
      <mb-radio-group
        [label]="'listSettings.repliesPolicy' | transloco"
        [hint]="'listSettings.repliesPolicyHint' | transloco"
        [options]="policyOptions"
        [value]="policy()"
        (valueChange)="policy.set($any($event))"
      />
      @if (error()) {
        <mb-notice tone="error" announcement="alert">{{ error() }}</mb-notice>
      }
      <ng-container mbDialogActions>
        <button mbButton type="button" variant="outline" (click)="closed.emit()">
          {{ 'listSettings.cancel' | transloco }}
        </button>
        <button mbButton type="button" [disabled]="!canSave()" (click)="save()">
          {{ (saving() ? 'listSettings.saving' : 'listSettings.save') | transloco }}
        </button>
      </ng-container>
    </mb-dialog>
  `,
  styles: `
    mb-radio-group {
      display: block;
      margin-top: 14px;
    }
  `,
})
export class ListSettingsDialog implements OnInit {
  private readonly api = inject(Api);
  private readonly transloco = inject(TranslocoService);

  readonly list = input.required<UserList>();
  readonly closed = output<void>();
  readonly saved = output<UserList>();

  protected readonly policyOptions = repliesPolicyOptions(this.transloco);
  protected readonly title = signal('');
  protected readonly policy = signal<ListRepliesPolicy>('list');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly canSave = computed(() => !this.saving() && !!this.title().trim());

  ngOnInit(): void {
    this.title.set(this.list().title);
    this.policy.set(this.list().replies_policy ?? 'list');
  }

  save(): void {
    const title = this.title().trim();
    if (this.saving()) return;
    if (!title) {
      this.error.set(this.transloco.translate('listSettings.nameRequired'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.editList(this.list(), { title, replies_policy: this.policy() }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.saved.emit(updated);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(
          this.transloco.translate('listSettings.error', { detail: describeHttpError(error) }),
        );
      },
    });
  }
}
