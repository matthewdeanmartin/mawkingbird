import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { MbRadioGroup, type RadioOption } from '../../../design-system/radio-group/radio-group';
import { Pseudonymity } from '../../pseudonymity';
import { onSetupNext } from '../setup-state';
import type { SetupPurpose as Purpose } from '../setup-store';

const OPTIONS: readonly RadioOption[] = [
  { value: 'me', label: 'Me', hint: 'Your own name and your own interests.' },
  {
    value: 'pseudonym',
    label: 'A pseudonym',
    hint: 'A name that isn’t linked to who you are. We’ll help keep it that way.',
  },
  { value: 'project', label: 'A project or organization' },
  { value: 'alt', label: 'A topic or a second account', hint: 'A place for one subject.' },
];

/**
 * What the account is for. Asked of every account, the first included: even a
 * first Mawkingbird account may be someone's second Mastodon account. The
 * answer sets later defaults, and a pseudonym turns Pseudonymity on, which is
 * why this replaces the onboarding card's "Is this a pseudonymous account?".
 */
@Component({
  selector: 'app-setup-purpose',
  imports: [MbRadioGroup],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <mb-radio-group
      label="This account is for"
      [options]="options"
      [value]="choice()"
      (valueChange)="choice.set($any($event))"
    />
  `,
})
export class SetupPurpose {
  private readonly pseudonymity = inject(Pseudonymity);
  protected readonly options = OPTIONS;
  private readonly state = onSetupNext(() => this.apply());
  protected readonly choice = signal<Purpose>(this.state.record().purpose ?? 'me');

  private apply(): void {
    const purpose = this.choice();
    const was = this.state.record().purpose;
    if (purpose === 'pseudonym') {
      this.pseudonymity.setEnabled(true);
      this.pseudonymity.setCleanLinks(true);
      this.pseudonymity.setCleanMedia(true);
    } else if (was === 'pseudonym') {
      // Only undo what this step turned on.
      this.pseudonymity.setEnabled(false);
    }
    this.state.save({ purpose });
    this.state.absorb(purpose === 'pseudonym' ? ['pseudonymous', 'pa-clean'] : ['pseudonymous']);
  }
}
