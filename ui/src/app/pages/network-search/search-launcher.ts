import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../auth';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { BLUESKY_WIRE_TYPE } from '../search/search-wire';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppOnlyLinkRel } from '../../public-page-urls';

export type SearchNetwork = 'mastodon' | 'bluesky';

// i18n focusedTools.search.mastodon: Search Mastodon
// i18n focusedTools.search.bluesky: Search Bluesky
// i18n focusedTools.search.what: What to find
// i18n focusedTools.search.search: Search
// i18n focusedTools.search.posts: Posts
// i18n focusedTools.search.people: People
// i18n focusedTools.search.hashtags: Hashtags
// i18n focusedTools.search.bskySignedIn: Signed in with Bluesky: posts and people are both searchable.
// i18n focusedTools.search.bskyNeeds: Bluesky only lets signed-in accounts search posts.
// i18n focusedTools.search.bskySignIn: Sign in with Bluesky
// i18n focusedTools.search.bskyNeedsAfter: , and you'll come straight back here. People search works without an account.
// i18n focusedTools.search.bskyPeople: No account needed to search for people.
// i18n focusedTools.search.bskyPeopleAfter: to search posts too.
// i18n focusedTools.search.mastoSignedIn: Signed in: post searches use your server's full-text search, where it offers one.
// i18n focusedTools.search.mastoNone: No account needed. Without one, Mastodon servers only search posts by hashtag;
// i18n focusedTools.search.mastoSignIn: sign in with Mastodon
// i18n focusedTools.search.mastoNoneAfter: for full-text post search, and you'll come straight back here.

interface TypeOption {
  value: 'statuses' | 'accounts' | 'hashtags';
  labelKey: string;
}

const TYPES: Record<SearchNetwork, readonly TypeOption[]> = {
  mastodon: [
    { value: 'statuses', labelKey: 'focusedTools.search.posts' },
    { value: 'accounts', labelKey: 'focusedTools.search.people' },
    { value: 'hashtags', labelKey: 'focusedTools.search.hashtags' },
  ],
  bluesky: [
    { value: 'statuses', labelKey: 'focusedTools.search.posts' },
    { value: 'accounts', labelKey: 'focusedTools.search.people' },
  ],
};

/**
 * The search box on /mastodon-search and /bluesky-search: type, pick what to
 * find, and land on the app's real search page with it already running.
 *
 * Nothing in between. `/search` admits a visitor without an account as an
 * anonymous reader (see `authGuard`), so there is no front page or sign-in
 * question on the way; signing in is offered here, beside the box, for the
 * searches that need it, and returns to this page.
 */
@Component({
  selector: 'app-search-launcher',
  imports: [TranslocoPipe, FormsModule, RouterLink, AppOnlyLinkRel, MbButton, MbControl, MbField],
  templateUrl: './search-launcher.html',
  styles: `
    .launcher {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 10px;
      align-items: end;
      margin: 8px 0 12px;
    }
    @media (max-width: 640px) {
      .launcher {
        grid-template-columns: 1fr 1fr;
      }
      .launcher mb-field:first-child {
        grid-column: 1 / -1;
      }
    }
    .better {
      margin: 0 0 24px;
      color: var(--muted);
      line-height: 1.5;
    }
  `,
})
export class SearchLauncher {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly bluesky = inject(BlueskySession);

  readonly network = input.required<SearchNetwork>();
  /** This tool page's own path, where signing in returns to. */
  readonly root = input.required<string>();

  protected readonly query = signal('');
  protected readonly type = signal<TypeOption['value']>('statuses');
  protected readonly types = computed(() => TYPES[this.network()]);

  /** Signed in with a real Mastodon account, not browsing anonymously. */
  protected readonly mastodonSignedIn = computed(
    () => this.auth.isAuthenticated && !this.auth.isAnonymous && !this.auth.lacksMastodonToken,
  );
  protected readonly blueskySignedIn = computed(() => this.bluesky.linked());

  /** Bluesky answers post searches only for a signed-in account. */
  protected readonly needsBlueskySignIn = computed(
    () => this.network() === 'bluesky' && this.type() === 'statuses' && !this.blueskySignedIn(),
  );

  protected readonly returnHere = computed(() => ({ next: this.root() }));

  protected search(): void {
    const q = this.query().trim();
    if (!q || this.needsBlueskySignIn()) return;
    const queryParams =
      this.network() === 'bluesky'
        ? { q, type: BLUESKY_WIRE_TYPE, bskyType: this.type() }
        : { q, type: this.type() };
    void this.router.navigate(['/search'], { queryParams });
  }
}
