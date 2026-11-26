import {
  Component,
  computed,
  effect,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { MbRadioGroup } from '../../../design-system/radio-group/radio-group';
import { KnownLanguages } from '../../../language/trend-language-filter';
import { ClientPrefs } from '../../../platform/storage/client-prefs';
import { languageOptions, PICKER_ORDER } from '../../onboarding/onboarding-questions';
import { onSetupNext } from '../setup-state';

/**
 * Languages read (app-wide, first account only) and the language this account
 * usually posts in (a Mastodon server setting). The same setters as the
 * onboarding card's `languages` and `post-language` cards, which this absorbs.
 */
@Component({
  selector: 'app-setup-languages',
  imports: [MbCheckbox, MbRadioGroup],
  template: `
    <fieldset class="setup-chips">
      <legend>I read</legend>
      @for (option of options(); track option.value) {
        <mb-checkbox
          [label]="option.label"
          [checked]="chosen().includes(option.value)"
          (checkedChange)="toggle(option.value, $event)"
        />
      }
    </fieldset>
    @if (postingOptions().length > 1) {
      <mb-radio-group
        label="I’ll mostly post in"
        [options]="postingOptions()"
        [value]="posting()"
        (valueChange)="posting.set($event)"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setup-steps.css',
})
export class SetupLanguages {
  private readonly prefs = inject(ClientPrefs);
  private readonly known = inject(KnownLanguages);
  private readonly state = onSetupNext(() => this.apply());

  private readonly initial = (() => {
    const known = this.prefs.knownLanguages();
    return known.length ? known : languageOptions(this.known.codes()).map((o) => o.value);
  })();
  protected readonly chosen = signal<string[]>(this.initial);
  protected readonly options = computed(() =>
    languageOptions([...this.initial, ...this.known.codes(), ...PICKER_ORDER]),
  );
  protected readonly postingOptions = computed(() =>
    this.options().filter((o) => this.chosen().includes(o.value)),
  );
  protected readonly posting = signal('');

  constructor() {
    this.state.loadServer();
    // Start from the server's posting language once it arrives, else the first read.
    effect(() => {
      if (this.posting()) return;
      const server = this.state.server.state()?.language;
      this.posting.set(server || this.chosen()[0] || '');
    });
  }

  protected toggle(code: string, on: boolean): void {
    this.chosen.update((list) =>
      on ? [...new Set([...list, code])] : list.filter((c) => c !== code),
    );
    if (!on && this.posting() === code) this.posting.set(this.chosen()[0] ?? '');
  }

  private async apply(): Promise<void> {
    this.prefs.setKnownLanguages(this.chosen());
    const posting = this.posting();
    const server = this.state.server.state();
    if (server && posting && posting !== server.language) {
      await this.state.server.write('language', posting);
    }
    this.state.absorb(['post-language'], ['languages']);
  }
}
