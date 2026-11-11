import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { FriendFeedsDialog } from '../friend-feeds-dialog/friend-feeds-dialog';
import { SupporterStatus } from '../../accounts/mawkingbird/supporter-status';
import { FriendFeedScan } from '../rss/friend-feed-scan';
import {
  FocusedNextSteps,
  toolInviteLink,
} from '../../public-pages/focused-apps/focused-next-steps';

// i18n focusedTools.feeds.title: Your friends' feeds
// i18n focusedTools.feeds.plusBefore: This is part of
// i18n focusedTools.feeds.plusAfter: : checking hundreds of websites is the most expensive thing the app does.
// i18n focusedTools.feeds.found.one: Found {{count}} feed on the {{checked}} sites checked. Open the results to follow it or download the OPML file.
// i18n focusedTools.feeds.found.other: Found {{count}} feeds on the {{checked}} sites checked. Open the results to follow them or download the OPML file.
// i18n focusedTools.feeds.progress: Show progress
// i18n focusedTools.feeds.results: Open the results
// i18n focusedTools.feeds.find: Find my friends' feeds
import { TranslocoPipe } from '@jsverse/transloco';
import { AppOnlyLinkRel } from '../../public-pages/public-page-urls';

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
  imports: [
    TranslocoPipe,
    FriendFeedsDialog,
    FocusedNextSteps,
    MbButton,
    RouterLink,
    AppOnlyLinkRel,
  ],
  template: `
    <section class="panel">
      <h2>{{ 'focusedTools.feeds.title' | transloco }}</h2>
      @if (!supporter.isSupporter()) {
        <p>
          {{ 'focusedTools.feeds.plusBefore' | transloco }}
          <a routerLink="/plans">Mawkingbird Plus</a
          >{{ 'focusedTools.feeds.plusAfter' | transloco }}
        </p>
      }
      @if (scan.result(); as result) {
        <p>
          {{
            (result.feeds.length === 1
              ? 'focusedTools.feeds.found.one'
              : 'focusedTools.feeds.found.other'
            ) | transloco: { count: result.feeds.length, checked: result.checkedCount }
          }}
        </p>
      }
      <button mbButton type="button" (click)="open.set(true)">
        {{
          (scan.running()
            ? 'focusedTools.feeds.progress'
            : scan.result()
              ? 'focusedTools.feeds.results'
              : 'focusedTools.feeds.find'
          ) | transloco
        }}
      </button>
    </section>

    @if (open()) {
      <app-friend-feeds-dialog (closed)="open.set(false)" />
    }

    @if (scan.result()) {
      <app-focused-next-steps [inviteLink]="invite" />
    }
  `,
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
})
export class FriendFeedsWorkbench {
  protected readonly invite = toolInviteLink();
  protected readonly scan = inject(FriendFeedScan);
  protected readonly supporter = inject(SupporterStatus);
  protected readonly open = signal(false);
}
