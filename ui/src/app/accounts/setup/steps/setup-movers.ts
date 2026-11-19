import { Component, signal } from '@angular/core';
import { MbRadioGroup, type RadioOption } from '../../../design-system/radio-group/radio-group';
import { onSetupNext } from '../setup-state';
import type { SetupMovers as Movers } from '../setup-store';

const OPTIONS: readonly RadioOption[] = [
  { value: 'twitter', label: 'Twitter', hint: 'Find the people you followed there.' },
  { value: 'bluesky', label: 'Bluesky', hint: 'Find your Bluesky people on Mastodon.' },
  { value: 'neither', label: 'Neither' },
];

/**
 * One question that opens the Twitter (Unbird) or Bluesky step. A sign-up that
 * began in Unbird arrives with `hint: 'twitter'` and starts on Twitter.
 */
@Component({
  selector: 'app-setup-movers',
  imports: [MbRadioGroup],
  template: `
    <mb-radio-group
      label="Before Mastodon I was on"
      [options]="options"
      [value]="choice()"
      (valueChange)="choice.set($any($event))"
    />
  `,
})
export class SetupMovers {
  protected readonly options = OPTIONS;
  private readonly state = onSetupNext(() => {
    const movers = this.choice();
    if (movers) this.state.save({ movers });
  });
  protected readonly choice = signal<Movers | null>(
    this.state.record().movers ?? (this.state.record().hint === 'twitter' ? 'twitter' : null),
  );
}
