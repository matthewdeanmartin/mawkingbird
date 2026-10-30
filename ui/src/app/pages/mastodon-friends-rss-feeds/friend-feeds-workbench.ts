import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { FriendFeedsDialog } from '../../friend-feeds-dialog/friend-feeds-dialog';
import { SupporterStatus } from '../../providers/account/supporter-status';
import { FriendFeedScan } from '../../providers/rss/friend-feed-scan';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';

/**
 * The signed-in body of /mastodon-friends-rss-feeds: the "Find your friends'
 * blogs" dialog from the RSS pages, opened from here.
 *
 * Plus-only, as everywhere (owner decision, sprint/seo-tools-2026-10-30.md):
 * every site checked is a request through the paid proxy. The dialog carries
 * the gate, so a non-supporter who opens it sees what Plus includes; this panel
 * says so before they click. The scan is root-provided, so closing the dialog
 * keeps its progress and result.
 */
@Component({
  selector: 'app-friend-feeds-workbench',
  imports: [FriendFeedsDialog, FocusedNextSteps, MbButton, RouterLink],
  template: `
    <section class="panel">
      <h2>Your friends' feeds</h2>
      @if (!supporter.isSupporter()) {
        <p>
          This is part of
          <a routerLink="/plans">Mawkingbird Plus</a>: checking hundreds of websites is the most
          expensive thing the app does.
        </p>
      }
      @if (scan.result(); as result) {
        <p>
          Found {{ result.feeds.length }} {{ result.feeds.length === 1 ? 'feed' : 'feeds' }} on the
          {{ result.checkedCount }} sites checked. Open the results to follow them or download the
          OPML file.
        </p>
      }
      <button mbButton type="button" (click)="open.set(true)">
        @if (scan.running()) {
          Show progress
        } @else if (scan.result()) {
          Open the results
        } @else {
          Find my friends' feeds
        }
      </button>
    </section>

    @if (open()) {
      <app-friend-feeds-dialog (closed)="open.set(false)" />
    }

    @if (scan.result()) {
      <app-focused-next-steps inviteLink="/mastodon-friends-rss-feeds/invite" />
    }
  `,
  styleUrl: '../focused-apps/focused-page.css',
})
export class FriendFeedsWorkbench {
  protected readonly scan = inject(FriendFeedScan);
  protected readonly supporter = inject(SupporterStatus);
  protected readonly open = signal(false);
}
