import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AccountSwitcher,
  accountChoiceHost,
  accountLabel,
  filterAccountChoices,
} from '../../account-switcher';
import { AccountChoice, Auth } from '../../auth';
import { MbButton } from '../../design-system/button/button';
import { MbField, MbControl } from '../../design-system/field/field';
import { MbPageHeader } from '../../design-system/page-header/page-header';

// i18n accountPicker.title: Switch account
// i18n accountPicker.intro: Every account saved in this browser. Type to narrow the list by name, handle or server.
// i18n accountPicker.search: Find an account
// i18n accountPicker.searchPlaceholder: Name, @handle or server
// i18n accountPicker.current: Signed in
// i18n accountPicker.count.one: {{shown}} of {{total}} account
// i18n accountPicker.count.other: {{shown}} of {{total}} accounts
// i18n accountPicker.none: No saved account matches "{{query}}".
// i18n accountPicker.anonymous: Anonymous
// i18n accountPicker.unavailable: Account details unavailable
// i18n accountPicker.thisServer: this server
// i18n accountPicker.kind.mastodon: Mastodon
// i18n accountPicker.kind.bluesky: Bluesky
// i18n accountPicker.kind.anonymous: Local only
// i18n accountPicker.addMastodon: + Add Mastodon account
// i18n accountPicker.addBluesky: + Add Bluesky account
// i18n accountPicker.standaloneIntro: Pick another saved account to carry on with. This page doesn't contact your current server, so it works even when that server is down.
// i18n accountPicker.backHome: Back to the app

/**
 * Full-page account picker, for people with more saved accounts than the
 * header menu can comfortably hold. Filtering and switching go through the
 * same helpers and {@link AccountSwitcher} as the menu, so a switch from here
 * gets the same verify, reload and rejected-token handling.
 *
 * Also mounted on its own at `/choose-account`, outside the shell, as the fail
 * whale's escape hatch: when the active account's server is down, the shell's
 * timelines and sidebars would keep asking it for things and raise the whale
 * again. There is no shell to provide {@link AccountSwitcher} there, so a pick
 * commits the switch directly and hard-navigates home; the shell that boots
 * under the new account does its usual verification.
 */
@Component({
  selector: 'app-account-picker',
  imports: [FormsModule, TranslocoPipe, MbButton, MbField, MbControl, MbPageHeader],
  templateUrl: './account-picker.html',
  styleUrl: './account-picker.css',
  host: { '[class.standalone]': 'standalone' },
})
export class AccountPicker {
  protected auth = inject(Auth);
  /** Absent on the standalone `/choose-account` route, which has no shell. */
  private switcher = inject(AccountSwitcher, { optional: true });
  protected readonly standalone = !this.switcher;

  protected readonly label = accountLabel;
  protected readonly host = accountChoiceHost;
  protected readonly query = signal('');

  protected readonly matches = computed(() =>
    filterAccountChoices(this.auth.otherSessions(), this.query()),
  );

  protected avatar(choice: AccountChoice): string {
    return choice.account?.avatar_static || choice.account?.avatar || '';
  }

  protected choose(choice: AccountChoice): void {
    if (this.switcher) {
      this.switcher.switchTo(choice);
      return;
    }
    if (this.auth.switchAccount(choice)) {
      this.navigate('home');
    }
  }

  /** Enter in the search box picks the only remaining match. */
  protected chooseOnlyMatch(): void {
    const matches = this.matches();
    if (matches.length === 1) this.choose(matches[0]);
  }

  addMastodonAccount(): void {
    location.assign('login/mastodon?add=1');
  }

  addBlueskyAccount(): void {
    location.assign('login/bluesky?add=1');
  }

  /** Seam so tests can assert the hard navigation without leaving the runner. */
  protected navigate(url: string): void {
    location.assign(url);
  }
}
