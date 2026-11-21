import { Component, computed, input } from '@angular/core';
import type { Account } from '../platform/api/models';
import { CustomEmojiPipe } from '../publishing/custom-emoji.pipe';

/** Render the name with this account's own server emoji. */
@Component({
  selector: 'app-account-name',
  imports: [CustomEmojiPipe],
  template: `
    @if (account().emojis?.length && name().includes(':')) {
      <span [innerHTML]="name() | customEmoji: account().emojis : true"></span>
    } @else {
      <span>{{ name() }}</span>
    }
  `,
})
export class AccountName {
  readonly account = input.required<Pick<Account, 'display_name' | 'username' | 'emojis'>>();
  readonly fallback = input<string>();
  protected readonly name = computed(
    () => this.account().display_name || this.fallback() || this.account().username,
  );
}
