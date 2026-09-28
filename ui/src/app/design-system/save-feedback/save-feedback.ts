import { Component, input } from '@angular/core';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Callers provide translated messages and own persistence/rollback. */
@Component({
  selector: 'mb-save-feedback',
  template: `
    <p role="status">{{ state() === 'saving' || state() === 'saved' ? message() : '' }}</p>
    <p role="alert" [id]="errorId() || null">{{ state() === 'error' ? message() : '' }}</p>
  `,
  styleUrl: './save-feedback.css',
})
export class MbSaveFeedback {
  readonly state = input<SaveState>('idle');
  readonly message = input('');
  readonly errorId = input('');
}
