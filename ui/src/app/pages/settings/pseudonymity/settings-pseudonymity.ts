import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../../../auth';
import { ClientLists } from '../../../lists/client-lists';
import { Pseudonymity } from '../../../pseudonymity';
import { PrivateFollows } from '../../../private-follows';
import { PrivateLikes, PRIVATE_LIKE_LIMIT } from '../../../private-likes';
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
// i18n settings.pseudonymity.likesHint: Use Private like in a post's menu to save a short reference here. No network like or notification is sent. These references stay in this browser and are not synced with Mawkingbird Plus.
// i18n settings.pseudonymity.likeCount: Private likes: {{count}} of {{limit}}
// i18n settings.pseudonymity.likesEmpty: No private likes yet.
// i18n settings.pseudonymity.removeLike: Remove private like for {{author}}
// i18n settings.pseudonymity.cleanLinks: Remove known tracking parameters from posted links
// i18n settings.pseudonymity.linksHint: Applies to Mastodon and Bluesky posts. Unknown parameters, fragments, signed links and shortened URLs are preserved; they can still contain identifiers. Review links before posting.
// i18n settings.pseudonymity.cleanMedia: Remove metadata from new photo uploads
// i18n settings.pseudonymity.mediaHint: Still JPEG and PNG only, up to 20 MB and 40 megapixels. Photos are re-encoded in this browser with a neutral filename; JPEG quality and colors may change. Animation, video, audio and other formats are blocked while this is enabled. Previously uploaded media is unchanged: remove it and attach it again. Visible details and alt text can still identify you.
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
  protected likes = inject(PrivateLikes);
  protected likeLimit = PRIVATE_LIKE_LIMIT;
  protected followLimit = ANONYMOUS_FOLLOW_LIMIT;
  protected saveFailed = signal(false);

  protected setEnabled(enabled: boolean): void {
    this.save(() => this.pseudonymity.setEnabled(enabled));
  }

  protected setReminder(reminder: boolean): void {
    this.save(() => this.pseudonymity.setReminder(reminder));
  }

  protected setCleanLinks(value: boolean): void {
    this.save(() => this.pseudonymity.setCleanLinks(value));
  }
  protected setCleanMedia(value: boolean): void {
    this.save(() => this.pseudonymity.setCleanMedia(value));
  }
  protected removeLike(url: string): void {
    this.save(() => this.likes.current()?.remove(url));
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
