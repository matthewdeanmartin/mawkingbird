import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../auth';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { BLUESKY_WIRE_TYPE } from '../search/search-wire';

export type SearchNetwork = 'mastodon' | 'bluesky';

interface TypeOption {
  value: 'statuses' | 'accounts' | 'hashtags';
  label: string;
}

const TYPES: Record<SearchNetwork, readonly TypeOption[]> = {
  mastodon: [
    { value: 'statuses', label: 'Posts' },
    { value: 'accounts', label: 'People' },
    { value: 'hashtags', label: 'Hashtags' },
  ],
  bluesky: [
    { value: 'statuses', label: 'Posts' },
    { value: 'accounts', label: 'People' },
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
  imports: [FormsModule, RouterLink, MbButton, MbControl, MbField],
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
