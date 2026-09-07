import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountHoverCard } from '../../account-hover-card/account-hover-card';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Account, Tag } from '../../models';
import { HomeTimelineFeed } from '../../home-timeline-feed';
import { Terminology } from '../../terminology';
import { AnonymousFollows } from '../../providers/anonymous/anonymous-follows';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { ProfileStack } from './profile-stack/profile-stack';
import { FollowState } from '../../follow-state';
import { TranslocoPipe } from '@jsverse/transloco';

// i18n shell.left.whoToFollow: Who to follow
// i18n shell.left.following: Following
// i18n shell.left.follow: Follow
// i18n shell.left.boostedByNetwork: {{boosted}} by people across the network
// i18n shell.left.findPeople: Find people to follow →
// i18n shell.left.trendsForYou: Trends for you

interface SuggestionCandidate {
  account: Account;
  boosters: Set<string>;
  sources: Set<string>;
  occurrences: number;
  lastSeen: number;
}

function accountKey(account: Account): string {
  if (account.url) return account.url.toLowerCase().replace(/\/$/, '');
  return account.acct.toLowerCase();
}

/**
 * Left sidebar: the stack of connected-identity cards (2018-Twitter style, one
 * per network — see {@link ProfileStack}), a "Who to follow" widget, and
 * trending hashtags beneath it. Suggestions are derived synthetically: accounts
 * whose posts were boosted by other people on the user's home timeline,
 * uniquified, minus yourself and anyone you follow.
 */
@Component({
  selector: 'app-left-rail',
  imports: [RouterLink, AccountHoverCard, ProfileStack, TranslocoPipe],
  templateUrl: './left-rail.html',
  styleUrl: './left-rail.css',
})
export class LeftRail implements OnInit {
  protected auth = inject(Auth);
  private api = inject(Api);
  private homeTimelineFeed = inject(HomeTimelineFeed);
  private anonymousFollows = inject(AnonymousFollows);
  private anonymous = inject(AnonymousAccount);
  private follows = inject(FollowState);
  protected words = inject(Terminology).words;
  private candidates = new Map<string, SuggestionCandidate>();

  protected suggestions = signal<Account[]>([]);
  /** Ids the user followed from this widget (flips the button to "Following"). */
  protected followed = signal<Set<string>>(new Set());
  protected trends = signal<Tag[]>([]);

  /** Most recent day's use count for a trending tag, if the server provides one. */
  uses(tag: Tag): string | null {
    return tag.history?.[0]?.uses ?? null;
  }

  ngOnInit(): void {
    this.api.trendingTags().subscribe({
      next: (tags) => this.trends.set(tags),
      error: () => {
        // Sidebar widget: fail silently.
      },
    });
    this.homeTimelineFeed.loaded.subscribe((statuses) => {
      const me = this.auth.account();
      const meKey = me ? accountKey(me) : '';
      for (const s of statuses) {
        const boosted = s.reblog?.account;
        const key = boosted ? accountKey(boosted) : '';
        if (boosted && key !== meKey && key !== accountKey(s.account)) {
          const candidate = this.candidates.get(key) ?? {
            account: boosted,
            boosters: new Set<string>(),
            sources: new Set<string>(),
            occurrences: 0,
            lastSeen: 0,
          };
          candidate.account = boosted;
          candidate.boosters.add(accountKey(s.account));
          candidate.sources.add(s.provider ?? 'mastodon');
          candidate.occurrences += 1;
          candidate.lastSeen = Math.max(candidate.lastSeen, Date.parse(s.created_at) || 0);
          this.candidates.set(key, candidate);
        }
      }
      if (!this.candidates.size) {
        this.suggestions.set([]);
        return;
      }
      const ranked = [...this.candidates.values()].sort(
        (a, b) =>
          b.boosters.size - a.boosters.size ||
          b.sources.size - a.sources.size ||
          b.occurrences - a.occurrences ||
          b.lastSeen - a.lastSeen,
      );
      if (this.auth.isAnonymous) {
        this.suggestions.set(
          ranked
            .map((candidate) => candidate.account)
            .filter(
              (account) => !this.anonymousFollows.isFollowing(account, this.anonymous.server()),
            ),
        );
        return;
      }
      const ids = ranked.map((candidate) => candidate.account.id);
      void this.follows.resolve(ids).then(() => {
        this.suggestions.set(
          ranked
            .map((candidate) => candidate.account)
            .filter((account) => !this.follows.excludesSuggestion(account.id)),
        );
      });
    });
  }

  follow(account: Account): void {
    if (this.auth.isAnonymous) {
      const result = this.anonymousFollows.follow(account, this.anonymous.server());
      if (result.ok) {
        this.followed.update((set) => new Set(set).add(account.id));
        this.suggestions.update((items) => items.filter((item) => item.id !== account.id));
      }
      return;
    }
    void this.follows.toggle(account.id).then((ok) => {
      if (ok) {
        this.followed.update((set) => new Set(set).add(account.id));
        this.suggestions.update((items) => items.filter((item) => item.id !== account.id));
      }
    });
  }
}
