import { Component, OnInit, input, signal } from '@angular/core';

/** The server whose public tag history the pages quote; the copy names it. */
export const ACTIVITY_SERVER = 'mastodon.social';

interface TagHistoryDay {
  day: string;
  uses: string;
  accounts: string;
}

/** Posts under a tag in the last seven days, from Mastodon's own daily counts. */
export function weeklyUses(history: readonly TagHistoryDay[] | undefined): number {
  return (history ?? []).slice(0, 7).reduce((sum, day) => sum + (Number(day.uses) || 0), 0);
}

/**
 * A live "N posts this week" line under a hashtag. Read in the browser only,
 * from the server's public, CORS-open tag endpoint with plain `fetch` (no
 * token, no interceptors), so the prerender never carries a number that goes
 * stale. Used inside `@defer`; shows nothing on failure or for a silent week.
 */
@Component({
  selector: 'app-tag-activity',
  template: `@if (posts(); as count) {
    <span class="activity">{{ format()(count) }}</span>
  }`,
  styles: `
    .activity {
      color: var(--muted);
      font-size: 0.9rem;
    }
  `,
})
export class TagActivity implements OnInit {
  readonly tag = input.required<string>();
  readonly format = input.required<(posts: number) => string>();
  protected readonly posts = signal(0);

  async ngOnInit(): Promise<void> {
    try {
      const response = await fetch(
        `https://${ACTIVITY_SERVER}/api/v1/tags/${encodeURIComponent(this.tag())}`,
        { credentials: 'omit' },
      );
      if (!response.ok) return;
      const body = (await response.json()) as { history?: TagHistoryDay[] };
      this.posts.set(weeklyUses(body.history));
    } catch {
      // A missing number is better than an error on a public page.
    }
  }
}
