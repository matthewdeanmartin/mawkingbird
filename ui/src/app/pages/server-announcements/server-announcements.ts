import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { InstanceInfo } from '../../models';
import { Api } from '../../api';
import { AnnouncementStore } from '../../announcements/announcement-store';

// i18n serverAnnouncements.announcements.one: {{active}} active this month · v{{version}} · {{count}} announcement
// i18n serverAnnouncements.announcements.other: {{active}} active this month · v{{version}} · {{count}} announcements
// i18n serverAnnouncements.title: Server announcements
// i18n serverAnnouncements.dismissAll: Dismiss all ({{count}})
// i18n serverAnnouncements.undismissAll: Undismiss all ({{count}})
// i18n serverAnnouncements.loading: Loading…
// i18n serverAnnouncements.empty: This server hasn't posted any announcements.
// i18n serverAnnouncements.dismissed: dismissed
// i18n serverAnnouncements.new: new
// i18n serverAnnouncements.dismiss: dismiss
// i18n serverAnnouncements.react: React {{emoji}}

// Same quick picks as the banner; the API accepts any unicode emoji.
const QUICK_REACTIONS = ['👍', '🎉', '❤️', '🚀'];

/**
 * The server, presented as a profile.
 *
 * A server posts — it just calls them announcements, and until now they were
 * only visible as a banner you dismissed and could never find again. This is
 * the page that banner should have been linking to all along: the server's
 * identity at the top, every announcement below it in reverse order, dismissed
 * ones included and marked as such.
 *
 * Deliberately not a real Mastodon profile: there is no account behind an
 * instance, so following, blocking and the rest have nothing to act on. What
 * carries over is the shape — header, then a timeline — because that is what
 * makes the announcements feel like things somebody wrote rather than chrome.
 */
@Component({
  selector: 'app-server-announcements',
  imports: [DatePipe, TranslocoPipe],
  templateUrl: './server-announcements.html',
  styleUrl: './server-announcements.css',
})
export class ServerAnnouncements implements OnInit {
  private api = inject(Api);
  protected store = inject(AnnouncementStore);

  protected readonly quickReactions = QUICK_REACTIONS;
  protected instance = signal<InstanceInfo | null>(null);

  /**
   * Newest first, dismissed ones kept.
   *
   * The banner's job is to show what you have not seen; this page's job is to
   * be the place where the one you dismissed last week is still findable.
   */
  protected readonly announcements = computed(() =>
    [...this.store.all()].sort((a, b) =>
      (b.published_at ?? '').localeCompare(a.published_at ?? ''),
    ),
  );

  protected readonly dismissedCount = computed(() => this.store.total() - this.store.activeCount());

  ngOnInit(): void {
    this.store.load();
    this.api.instanceInfo().subscribe({
      next: (info) => this.instance.set(info),
      error: () => this.instance.set(null),
    });
  }

  protected isDismissed(id: string): boolean {
    return this.store.isDismissed(id);
  }
}
