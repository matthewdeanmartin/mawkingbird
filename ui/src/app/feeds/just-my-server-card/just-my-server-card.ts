import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbRailCard } from '../../design-system/identity/rail-card';
import { MbSwitch } from '../../design-system/identity/switch';
import { JustMyServer } from '../just-my-server';

// i18n shell.rail.singleServerMode: Single Server Mode
// i18n shell.rail.justMyServer: Just My Server
// i18n shell.rail.justMyServerAria: Just My Server mode
// i18n shell.rail.homeOnly: Home shows only people you follow on {{server}}. Remote boosts stay out.
// i18n shell.rail.checkingFriends: Checking friends…
// i18n shell.rail.updateMyServer: Update My Server list
// i18n shell.rail.checkingGenerated: Checking for the generated list…
// i18n shell.rail.updateBeforeEnable: Update the list before turning this mode on.
// i18n shell.rail.updateResult: Added {{added}} · Removed {{removed}} · Already present {{alreadyPresent}} · Failed {{failed}}
// i18n shell.rail.updateTitle: Update My Server list?
// i18n shell.rail.user.one: user
// i18n shell.rail.user.other: users
// i18n shell.rail.updatePrompt: Add {{addCount}} {{addWord}} and remove {{removeCount}} {{removeWord}} so the list contains only friends on {{server}}?
// i18n shell.rail.alreadyPresent: {{count}} already present. The list is <strong>{{title}}</strong>.
// i18n shell.rail.cancel: Cancel
// i18n shell.rail.updating: Updating…
// i18n shell.rail.updateList: Update list

/**
 * Every mounted card. The rail and the My Server page can both show one, and
 * their dialog state is shared, so only the newest renders the dialog;
 * otherwise one Update press would open two stacked dialogs.
 */
const mounted = signal<readonly JustMyServerCard[]>([]);

/**
 * The Just My Server switch, its list-update button and the confirm dialog.
 *
 * Shared by the right rail, which shows it only on small servers (or once it is
 * on), and the My Server page, which always does, so the mode stays reachable
 * on big general servers without crowding the rail's server card there.
 * All state lives in {@link JustMyServer}; callers decide whether it applies
 * (signed in, with a usable Mastodon source).
 */
@Component({
  selector: 'app-just-my-server-card',
  imports: [MbButton, MbDialog, MbRailCard, MbSwitch, TranslocoPipe],
  templateUrl: './just-my-server-card.html',
  styleUrl: './just-my-server-card.css',
})
export class JustMyServerCard {
  protected justMyServer = inject(JustMyServer);
  protected readonly hostsDialog = computed(() => mounted().at(-1) === this);

  constructor() {
    mounted.update((list) => [...list, this]);
    inject(DestroyRef).onDestroy(() => mounted.update((list) => list.filter((c) => c !== this)));
  }
}
