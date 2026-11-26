import { Component, effect, signal, ChangeDetectionStrategy } from '@angular/core';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { MbRadioGroup, type RadioOption } from '../../../design-system/radio-group/radio-group';
import type { ServerField, ServerSettings } from '../../onboarding/onboarding-questions';
import { onSetupNext } from '../setup-state';

type Findable = Pick<ServerSettings, 'discoverable' | 'indexable' | 'locked' | 'privacy'>;

const VISIBILITY: readonly RadioOption[] = [
  { value: 'public', label: 'Public', hint: 'Anyone can see, find and boost your posts.' },
  {
    value: 'unlisted',
    label: 'Quiet public',
    hint: 'Anyone can see them, but they stay out of trends and public timelines.',
  },
  {
    value: 'private',
    label: 'Followers only',
    hint: 'A new account has no followers yet, so almost nobody will see these. They can’t be boosted.',
  },
];

/**
 * Who can find this account. Owner rule: say plainly what each privacy choice
 * costs. Most of them cut followers and conversation sharply, and a new
 * account needs both. Nothing is scary and nothing is hidden.
 *
 * A pseudonym starts from the private choices (spec § Purpose-driven
 * defaults); they apply only when the person presses Next.
 */
@Component({
  selector: 'app-setup-findable',
  imports: [MbCheckbox, MbRadioGroup],
  template: `
    @if (choice(); as c) {
      <mb-checkbox
        label="Show me in suggestions and the profile directory"
        hint="Off: far fewer people will find you. Most new followers come from here."
        [checked]="c.discoverable"
        (checkedChange)="set('discoverable', $event)"
      />
      <mb-checkbox
        label="Let people find my public posts by their words"
        hint="On servers with full-text search. Off: your posts are found only by hashtag."
        [checked]="c.indexable"
        (checkedChange)="set('indexable', $event)"
      />
      <mb-checkbox
        label="Approve each new follower myself"
        hint="Most people won’t wait to be approved. Expect far fewer followers and much less interaction."
        [checked]="c.locked"
        (checkedChange)="set('locked', $event)"
      />
      <mb-radio-group
        label="Who sees your posts by default"
        hint="You can change it on each post."
        [options]="visibility"
        [value]="c.privacy"
        (valueChange)="set('privacy', $event)"
      />
    } @else {
      <p class="setup-loading">Loading your server settings…</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setup-steps.css',
})
export class SetupFindable {
  private readonly state = onSetupNext(() => this.apply());
  protected readonly visibility = VISIBILITY;
  protected readonly choice = signal<Findable | null>(null);

  constructor() {
    this.state.loadServer();
    effect(() => {
      const server = this.state.server.state();
      if (!server || this.choice()) return;
      const pseudonym = this.state.record().purpose === 'pseudonym';
      this.choice.set({
        discoverable: pseudonym ? false : server.discoverable,
        indexable: pseudonym ? false : server.indexable,
        locked: pseudonym ? true : server.locked,
        privacy: server.privacy,
      });
    });
  }

  protected set<K extends keyof Findable>(field: K, value: Findable[K]): void {
    this.choice.update((c) => (c ? { ...c, [field]: value } : c));
  }

  private async apply(): Promise<void> {
    const choice = this.choice();
    const server = this.state.server.state();
    if (!choice || !server) return;
    for (const field of ['discoverable', 'indexable', 'locked', 'privacy'] as const) {
      if (choice[field] !== server[field]) {
        await this.state.server.write(field as ServerField, choice[field]);
      }
    }
    this.state.absorb(['pa-discoverable', 'pa-locked', 'visibility']);
  }
}
