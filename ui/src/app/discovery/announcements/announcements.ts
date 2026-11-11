import { Component, inject, OnInit } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Announcement } from '../../platform/api/models';
import {
  AnnouncementStore,
  QUICK_REACTIONS,
  ReactionChip,
  reactionChips,
} from './announcement-store';

// i18n announcements.dismiss: Dismiss
// i18n announcements.label: 📣 Announcement
// i18n announcements.react: React {{emoji}}

/**
 * Active instance announcements shown above a timeline (dismiss + react).
 *
 * The data, the dismissed set and the reaction writes all live in
 * {@link AnnouncementStore} now, because the rail's server card and the server
 * page show the same announcements and must not disagree about which are still
 * unread. This component is the banner presentation of that shared state.
 */
@Component({
  selector: 'app-announcements',
  imports: [TranslocoPipe],
  templateUrl: './announcements.html',
  styleUrl: './announcements.css',
})
export class Announcements implements OnInit {
  protected store = inject(AnnouncementStore);

  protected readonly quickReactions = QUICK_REACTIONS;
  protected announcements = this.store.active;

  ngOnInit(): void {
    this.store.load();
  }

  dismiss(a: Announcement): void {
    this.store.dismiss(a.id);
  }

  /** Every reaction with its count, quick picks included at 0. */
  protected chips(a: Announcement): ReactionChip[] {
    return reactionChips(a, this.quickReactions);
  }

  toggleReaction(a: Announcement, name: string): void {
    this.store.toggleReaction(a, name);
  }
}
