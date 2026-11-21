import { computed, signal } from '@angular/core';
import type { DraftPoll } from './drafts';

/** Poll expiry presets (label → seconds). */
export const POLL_EXPIRY = [
  { label: '5 minutes', seconds: 300 },
  { label: '1 hour', seconds: 3600 },
  { label: '6 hours', seconds: 21600 },
  { label: '1 day', seconds: 86400 },
  { label: '3 days', seconds: 259200 },
  { label: '7 days', seconds: 604800 },
] as const;

/** Each editor owns one instance. Drafts preserve unfinished choices verbatim. */
export class PollEditor {
  readonly open = signal(false);
  readonly options = signal<string[]>(['', '']);
  readonly multiple = signal(false);
  readonly expiresIn = signal(86400);
  readonly canAdd = computed(() => this.options().length < 4);
  readonly canRemove = computed(() => this.options().length > 2);
  readonly filledOptions = computed(() =>
    this.options()
      .map((option) => option.trim())
      .filter(Boolean),
  );
  readonly valid = computed(() => this.filledOptions().length >= 2);

  setOption(index: number, value: string): void {
    this.options.update((options) => options.map((option, at) => (at === index ? value : option)));
  }

  addOption(): boolean {
    if (!this.canAdd()) return false;
    this.options.update((options) => [...options, '']);
    return true;
  }

  removeOption(index: number): boolean {
    if (!this.canRemove()) return false;
    this.options.update((options) => options.filter((_, at) => at !== index));
    return true;
  }

  snapshot(): DraftPoll | null {
    return this.open()
      ? { options: [...this.options()], multiple: this.multiple(), expiresIn: this.expiresIn() }
      : null;
  }

  restore(poll: DraftPoll | null): void {
    this.open.set(!!poll);
    this.options.set(poll && poll.options.length >= 2 ? [...poll.options] : ['', '']);
    this.multiple.set(poll?.multiple ?? false);
    if (poll) this.expiresIn.set(poll.expiresIn);
  }

  toggle(): void {
    if (this.open()) this.restore(null);
    else this.open.set(true);
  }
}
