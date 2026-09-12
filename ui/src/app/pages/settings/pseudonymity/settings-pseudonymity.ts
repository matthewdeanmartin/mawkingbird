import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../../../auth';
import { ClientLists } from '../../../lists/client-lists';
import { Pseudonymity } from '../../../pseudonymity';
import { PrivateFollows } from '../../../private-follows';
import {
  AnonymousFollow,
  ANONYMOUS_FOLLOW_LIMIT,
} from '../../../providers/anonymous/anonymous-follows';

// i18n settings.pseudonymity.title: Pseudonymity
// i18n settings.pseudonymity.intro: Reduce accidental links between this account and your personal identity. These settings apply only to this account in this browser.
// i18n settings.pseudonymity.enabled: This is a pseudonymous account
// i18n settings.pseudonymity.reminder: Remind me before posting
// i18n settings.pseudonymity.reminderHint: Enabling pseudonymity turns this reminder on. You can turn the reminder off while keeping pseudonymity on. Other accounts keep their existing posting settings.
// i18n settings.pseudonymity.local: Kept in this browser. Pseudonymity settings are not synced with Mawkingbird Plus. Clearing this account's local data removes them.
// i18n settings.pseudonymity.limits: Pseudonymity does not change post visibility or hide activity from your server. Normal follows and likes still use the network.
// i18n settings.pseudonymity.privateLists: Private lists
// i18n settings.pseudonymity.listCount: {{count}} lists in this browser
// i18n settings.pseudonymity.listHint: Read accounts without publicly following them. While pseudonymity is on, these lists cannot be copied to Mawkingbird Plus. Existing account lists on Plus remain separate.
// i18n settings.pseudonymity.manageLists: Manage private lists
// i18n settings.pseudonymity.privateFollows: Private follows
// i18n settings.pseudonymity.followsHint: Use Private follow in a profile's menu to add its public posts to Home. No network follow or notification is sent. These follows stay in this browser and are not synced with Mawkingbird Plus.
// i18n settings.pseudonymity.followCount: Private follows: {{count}} of {{limit}}
// i18n settings.pseudonymity.followsEmpty: No private follows yet.
// i18n settings.pseudonymity.removeFollow: Remove private follow for {{handle}}
// i18n settings.pseudonymity.privateLikes: Private likes
// i18n settings.pseudonymity.likesPending: Separate browser-only likes are not available for this account yet. Existing Likes are network actions, not private saves.
// i18n settings.pseudonymity.saveFailed: This setting could not be saved in your browser. Free some local storage and try again.
@Component({
  selector: 'app-settings-pseudonymity',
  imports: [FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './settings-pseudonymity.html',
})
export class SettingsPseudonymity {
  protected auth = inject(Auth);
  protected pseudonymity = inject(Pseudonymity);
  protected lists = inject(ClientLists);
  protected follows = inject(PrivateFollows);
  protected followLimit = ANONYMOUS_FOLLOW_LIMIT;
  protected saveFailed = signal(false);

  protected setEnabled(enabled: boolean): void {
    this.save(() => this.pseudonymity.setEnabled(enabled));
  }

  protected setReminder(reminder: boolean): void {
    this.save(() => this.pseudonymity.setReminder(reminder));
  }

  protected removeFollow(follow: AnonymousFollow): void {
    this.save(() => this.follows.current()?.unfollow(follow.account, follow.readRef.server));
  }

  private save(change: () => void): void {
    try {
      change();
      this.saveFailed.set(false);
    } catch {
      this.saveFailed.set(true);
    }
  }
}
