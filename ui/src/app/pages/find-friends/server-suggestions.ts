import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { accountProfilePath } from '../../account-route';
import { Api } from '../../api';
import { MbButton } from '../../design-system/button/button';
import { Account, FollowSuggestion, Relationship } from '../../models';
import { Server } from '../../server';
import { AccountResultCard } from '../search/account-result-card';

// i18n pages.findFriends.suggestions.heading: Suggested by your server
// i18n pages.findFriends.suggestions.sub: Your server picks these from who is popular there and who resembles the people you follow. "Not interested" removes someone for good.
// i18n pages.findFriends.suggestions.loading: Loading suggestions…
// i18n pages.findFriends.suggestions.none: Your server has no suggestions for you right now.
// i18n pages.findFriends.suggestions.failed: Could not load your server's suggestions.
// i18n pages.findFriends.suggestions.dismiss: Not interested
// i18n pages.findFriends.suggestions.why.featured: Hand-picked by the {{domain}} team
// i18n pages.findFriends.suggestions.why.most_followed: Popular on {{domain}}
// i18n pages.findFriends.suggestions.why.most_interactions: Getting attention on {{domain}}
// i18n pages.findFriends.suggestions.why.similar_to_recently_followed: Similar to profiles you recently followed
// i18n pages.findFriends.suggestions.why.friends_of_friends: Popular among people you follow
// i18n pages.findFriends.suggestions.why.other: Suggested by {{domain}}

const KNOWN_SOURCES = new Set([
  'featured',
  'most_followed',
  'most_interactions',
  'similar_to_recently_followed',
  'friends_of_friends',
]);

/**
 * The signed-in server's own follow suggestions (`GET /api/v2/suggestions`),
 * each with the reason the server gives. A secondary discovery route: the
 * curated ways above it come first.
 */
@Component({
  selector: 'app-server-suggestions',
  imports: [AccountResultCard, MbButton, TranslocoPipe],
  template: `
    <h2 class="ff-heading">{{ 'pages.findFriends.suggestions.heading' | transloco }}</h2>
    <p class="muted small ff-sub">{{ 'pages.findFriends.suggestions.sub' | transloco }}</p>
    @if (state() === 'loading') {
      <p class="muted small ff-sub" role="status">
        {{ 'pages.findFriends.suggestions.loading' | transloco }}
      </p>
    } @else if (state() === 'failed') {
      <p class="muted small ff-sub">{{ 'pages.findFriends.suggestions.failed' | transloco }}</p>
    } @else if (!suggestions().length) {
      <p class="muted small ff-sub">{{ 'pages.findFriends.suggestions.none' | transloco }}</p>
    } @else {
      @for (s of suggestions(); track s.account.id) {
        <div class="suggestion">
          <app-account-result-card
            [item]="{ account: s.account, matchingPosts: [] }"
            [relationship]="relationships()[s.account.id] ?? null"
            [profileLink]="profileLink(s.account)"
            [followBusy]="busy() === s.account.id"
            [reason]="why(s)"
            (follow)="follow($event)"
            (unfollow)="unfollow($event)"
          />
          <button
            mbButton
            variant="link"
            type="button"
            class="suggestion-dismiss"
            [disabled]="busy() === s.account.id"
            (click)="dismiss(s.account)"
          >
            {{ 'pages.findFriends.suggestions.dismiss' | transloco }}
          </button>
        </div>
      }
    }
  `,
  styles: `
    .ff-heading {
      margin: 0;
      padding: 20px 16px 4px;
      font-size: 15px;
      font-weight: 700;
    }
    .ff-sub {
      margin: 0;
      padding: 0 16px 10px;
      border-bottom: 1px solid var(--border);
    }
    .suggestion {
      border-bottom: 1px solid var(--border);
    }
    .suggestion-dismiss {
      margin: 0 16px 10px;
    }
  `,
})
export class ServerSuggestions implements OnInit {
  private readonly api = inject(Api);
  private readonly server = inject(Server);
  private readonly transloco = inject(TranslocoService);

  protected readonly state = signal<'loading' | 'loaded' | 'failed'>('loading');
  protected readonly suggestions = signal<FollowSuggestion[]>([]);
  protected readonly relationships = signal<Record<string, Relationship>>({});
  protected readonly busy = signal<string | null>(null);
  private readonly domain = computed(() => {
    try {
      return new URL(this.server.baseUrl()).host;
    } catch {
      return '';
    }
  });

  ngOnInit(): void {
    this.api.followSuggestions().subscribe({
      next: (list) => {
        this.suggestions.set(list ?? []);
        this.state.set('loaded');
        const ids = (list ?? []).map((s) => s.account.id);
        if (ids.length) {
          this.api.relationships(ids).subscribe({
            next: (rels) => this.relationships.set(Object.fromEntries(rels.map((r) => [r.id, r]))),
            error: () => undefined,
          });
        }
      },
      error: () => this.state.set('failed'),
    });
  }

  protected profileLink(account: Account): (string | number)[] {
    return accountProfilePath(account);
  }

  /** The server's first stated reason, in Mastodon's own wording. */
  protected why(s: FollowSuggestion): string {
    const source = s.sources?.find((x) => KNOWN_SOURCES.has(x)) ?? 'other';
    return this.transloco.translate(`pages.findFriends.suggestions.why.${source}`, {
      domain: this.domain(),
    });
  }

  protected follow(account: Account): void {
    this.busy.set(account.id);
    this.api.follow(account.id).subscribe({
      next: (rel) => {
        this.busy.set(null);
        this.relationships.update((map) => ({ ...map, [account.id]: rel }));
      },
      error: () => this.busy.set(null),
    });
  }

  protected unfollow(account: Account): void {
    this.busy.set(account.id);
    this.api.unfollow(account.id).subscribe({
      next: (rel) => {
        this.busy.set(null);
        this.relationships.update((map) => ({ ...map, [account.id]: rel }));
      },
      error: () => this.busy.set(null),
    });
  }

  protected dismiss(account: Account): void {
    this.busy.set(account.id);
    this.api.dismissSuggestion(account.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.suggestions.update((list) => list.filter((s) => s.account.id !== account.id));
      },
      error: () => this.busy.set(null),
    });
  }
}
