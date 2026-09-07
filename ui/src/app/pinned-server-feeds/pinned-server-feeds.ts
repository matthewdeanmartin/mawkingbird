import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../auth';
import { FeedCapability } from '../feed-capability';
import { JustMyServer } from '../just-my-server';
import { SERVER_FEEDS, ServerFeedDef } from '../lists/server-feeds';

/**
 * Shortcuts to this server's own feeds, for Just My Server mode.
 *
 * Single Server Mode narrows Home to people on your instance, which makes the
 * instance's own feeds the interesting neighbours — and they were three clicks
 * away under Feeds. This puts them one click away, next to the timeline they
 * complement.
 *
 * Replaces a lone "🏠 Local Feed" link that was projected into the command bar
 * without the bar's `command-item` class, so it shrank and scrolled out of
 * reach under the right rail. A row of its own is both the fix and the feature.
 *
 * Rows are capability-probed exactly as the Feeds page probes them: a server
 * that refuses a feed does not get a link to it. "Answered with nothing" is not
 * a refusal — a quiet morning must not hide the local timeline.
 */
@Component({
  selector: 'app-pinned-server-feeds',
  imports: [RouterLink, RouterLinkActive],
  template: `
    @if (feeds().length || friendsListId()) {
      <nav class="pinned-feeds" aria-label="Server feeds">
        <span class="pinned-label">{{ host() }}</span>
        @for (feed of feeds(); track feed.feed) {
          <a
            class="pinned-item"
            [routerLink]="['/feeds', feed.feed]"
            routerLinkActive="active"
            [title]="feed.blurb"
          >
            {{ icon(feed.feed) }} {{ label(feed) }}
          </a>
        }
        <!-- The generated "people on this server" list, which is the whole
             point of the mode: your friends here, as a feed. Absent until the
             list has been built, because linking to a list id we do not have
             is a dead end. -->
        @if (friendsListId(); as listId) {
          <a
            class="pinned-item"
            [routerLink]="['/lists', listId]"
            routerLinkActive="active"
            title="People you follow who are on this server"
          >
            👥 My friends here
          </a>
        }
      </nav>
    }
  `,
  styles: `
    .pinned-feeds {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }
    .pinned-label {
      flex: 0 0 auto;
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      margin-right: 4px;
      white-space: nowrap;
    }
    .pinned-item {
      flex: 0 0 auto;
      border-radius: 5px;
      padding: 5px 8px;
      font-size: 13px;
      color: var(--text);
      text-decoration: none;
      white-space: nowrap;
    }
    .pinned-item:hover {
      background: var(--hover);
    }
    .pinned-item.active {
      background: var(--accent-soft);
      color: var(--accent);
    }
  `,
})
export class PinnedServerFeeds implements OnInit {
  private auth = inject(Auth);
  private feedCaps = inject(FeedCapability);
  private justMyServer = inject(JustMyServer);

  protected readonly feeds = signal<ServerFeedDef[]>([]);
  protected readonly friendsListId = computed(() => this.justMyServer.listId());
  protected readonly host = computed(() => this.justMyServer.homeHost() || 'This server');

  ngOnInit(): void {
    this.resolve();
  }

  /** Shorter than the Feeds page's titles: this is a toolbar, not a directory. */
  protected label(def: ServerFeedDef): string {
    switch (def.feed) {
      case 'local':
        return 'Local';
      case 'trending':
        return 'Trending';
      case 'news':
        return 'Links';
      default:
        return def.title;
    }
  }

  protected icon(feed: string): string {
    switch (feed) {
      case 'local':
        return '🏠';
      case 'trending':
        return '🔥';
      case 'news':
        return '🔗';
      default:
        return '🌐';
    }
  }

  /**
   * Same two-step the Feeds page uses: show what is already known, then confirm
   * in the background so a newly-probed feed appears (or a refused one leaves)
   * without a reload.
   */
  private resolve(): void {
    // The federated timeline is deliberately absent: Just My Server exists to
    // keep the rest of the fediverse out, so offering it here would undo the
    // mode from its own toolbar.
    const eligible = SERVER_FEEDS.filter(
      (f) => f.feed !== 'federated' && (!f.authRequired || !this.auth.isAnonymous),
    );
    this.feeds.set(eligible.filter((f) => this.feedCaps.shows(f.capability)));

    for (const def of eligible) {
      void this.feedCaps.ensure(def.capability).then((ability) => {
        this.feeds.update((current) => {
          const without = current.filter((f) => f.feed !== def.feed);
          if (ability === 'refused') {
            return without;
          }
          const next = [...without, def];
          const order = eligible.map((f) => f.feed);
          return next.sort((a, b) => order.indexOf(a.feed) - order.indexOf(b.feed));
        });
      });
    }
  }
}
