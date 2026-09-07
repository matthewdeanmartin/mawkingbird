import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { FocusTrap } from '../a11y/focus-trap';
import { UserList } from '../models';
import { PEOPLE_CATEGORIES } from './people-categories';
import { PeopleLists } from './people-lists';

// i18n peopleLists.title: Your people, in lists
// i18n peopleLists.intro: Create lists that categorize people by interaction style
// i18n peopleLists.generate: Generate lists of mutuals, etc.
// i18n peopleLists.update: Update people lists
// i18n peopleLists.status.new: Generate a snapshot of the people you follow.
// i18n peopleLists.status.missing: Some or all generated lists are missing. Update will recreate them.
// i18n peopleLists.status.stale: These lists may be stale. Update to refresh their membership.
// i18n peopleLists.status.fresh: Recently synchronized. Relationships can still change; update whenever you need.
// i18n peopleLists.status.addOnly: Last updated with additions only. Run a full update to remove outdated members.
// i18n peopleLists.lastSync: Last successful update:
// i18n peopleLists.dialog.title: Generate or update your people lists
// i18n peopleLists.dialog.scope: Creates eleven private Mastodon lists, each prefixed “Mawkingbird:”. A person can belong to more than one category. Existing generated lists are reused and missing ones recreated.
// i18n peopleLists.dialog.following: Only people you currently follow can belong to these server lists. Readers you do not follow are left out; nobody is automatically followed, unfollowed, muted, or notified.
// i18n peopleLists.dialog.sample: Relationships use your complete follow list. Interactions use up to ten recent pages each of notifications, your posts, and Home, plus evidence remembered in this browser. Older interactions may be missed. Chatty and Broadcasters need at least five observed posts; nobody’s individual timeline is downloaded.
// i18n peopleLists.dialog.snapshot: This is a snapshot, not automatic upkeep. After seven days, a changed follow count, or missing lists, we offer a refresh. You can update sooner. Closing this dialog or visiting another page keeps the job running; reloading or switching accounts stops it. Reopen Lists to see progress.
// i18n peopleLists.dialog.sync: A full update adds matching people and removes nonmatching members, including manual additions, from these generated lists. Other lists are untouched. If stopped halfway, changes already made stay; run Update again to finish.
// i18n peopleLists.onlyAdd: Only add, don’t remove from lists
// i18n peopleLists.start: Generate / update lists
// i18n peopleLists.category.top_friends: Top friends — mutuals who have mentioned, liked, boosted, or triggered a post notification for you.
// i18n peopleLists.category.mutuals: Mutuals — people you follow who currently follow you back.
// i18n peopleLists.category.readers: Readers — people you follow who have boosted you.
// i18n peopleLists.category.idols: Idols — people you have replied to who do not follow you back and have sent no observed notifications.
// i18n peopleLists.category.parasocials: Celebrities — more than 10,000 followers and not following you back.
// i18n peopleLists.category.bots: Bots — accounts explicitly marked as bots.
// i18n peopleLists.category.chatty: Chatty — more than half their observed posts are replies.
// i18n peopleLists.category.broadcasters: Broadcasters — fewer than one fifth of their observed posts are replies.
// i18n peopleLists.category.lively: Lively — last posted within 30 days.
// i18n peopleLists.category.graveyard: Zombies — no known posts, or last posted over 90 days ago. Missing activity metadata is treated as unknown.
// i18n peopleLists.category.other: Other — everyone who matches none of the views above.
// i18n peopleLists.step.following: Reading everyone you follow…
// i18n peopleLists.step.relationships: Checking relationships and account activity…
// i18n peopleLists.step.activity: Reading a limited interaction sample…
// i18n peopleLists.step.lists: Synchronizing your server lists…
// i18n peopleLists.progress: {{scanned}} people read · {{requests}} requests · {{completed}} of 11 lists synchronized
// i18n peopleLists.changes: {{created}} lists created · {{added}} memberships added · {{removed}} removed
// i18n peopleLists.done: Your people lists are ready. Open a list below to read its feed.
// i18n peopleLists.cancelled: Stopped. Any completed changes remain. Update again to finish.
// i18n peopleLists.failed: The update could not finish. Any completed changes remain. Update again to repair the lists.
@Component({
  selector: 'app-people-lists-panel',
  imports: [DatePipe, FormsModule, TranslocoPipe, FocusTrap],
  templateUrl: './people-lists-panel.html',
  styleUrl: './people-lists-panel.css',
})
export class PeopleListsPanel {
  readonly lists = input<UserList[]>([]);
  readonly loading = input(false);
  readonly changed = output<void>();
  protected service = inject(PeopleLists);
  protected dialog = signal(false);
  protected onlyAdd = signal(false);
  protected categories = PEOPLE_CATEGORIES;
  private now = signal(Date.now());
  protected status = computed(() => this.service.status(this.lists(), this.now()));
  protected pauseSeconds = computed(() =>
    Math.max(0, Math.ceil(((this.service.job()?.pausedUntil ?? 0) - this.now()) / 1000)),
  );

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    let wasRunning = false;
    effect(() => {
      const running = this.service.running();
      if (wasRunning && !running && this.service.job()) this.changed.emit();
      wasRunning = running;
    });
  }
  protected open(): void {
    this.onlyAdd.set(false);
    this.dialog.set(true);
  }
  protected start(): void {
    this.dialog.set(false);
    void this.service.start(this.onlyAdd());
  }
}
