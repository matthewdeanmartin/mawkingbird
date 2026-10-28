import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TwitterFriendDiscovery } from '../settings/import-export/twitter-friend-discovery';

/**
 * Where to go once the import has done its job: into Mawkingbird proper.
 *
 * Shown only after a search has run, so the page's first ask stays the import
 * itself; invitations and the rest of the app come after it, not instead of it.
 */
@Component({
  selector: 'app-twitter-import-next-steps',
  imports: [RouterLink],
  template: `
    @if (attempted()) {
      <section class="next-steps" aria-labelledby="next-steps-title">
        <h2 id="next-steps-title">Next: make Mawkingbird your everyday Mastodon app</h2>
        <ul>
          <li>
            <a routerLink="/home">
              <strong>Open your home feed</strong>
              <span>Posts from the people you just followed, newest first.</span>
            </a>
          </li>
          <li>
            <a routerLink="/follow">
              <strong>Follow more people</strong>
              <span>Hand-picked starter kits, grouped by interest.</span>
            </a>
          </li>
          <li>
            <a [routerLink]="signedIn() ? '/twitter-to-mastodon/invite' : '/invites'">
              <strong>Invite friends who are still on Twitter</strong>
              <span>Ready-made posts that tell them where to find you.</span>
            </a>
          </li>
          <li>
            <a routerLink="/features">
              <strong>See what else Mawkingbird does</strong>
              <span>Bluesky and RSS, bookmarks, readable articles and writing tools.</span>
            </a>
          </li>
        </ul>
      </section>
    }
  `,
  styles: `
    .next-steps {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }
    ul {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      padding: 0;
      list-style: none;
    }
    a {
      display: block;
      height: 100%;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--col-bg);
      color: var(--text);
      text-decoration: none;
    }
    a:hover,
    a:focus-visible {
      border-color: var(--accent);
    }
    strong,
    span {
      display: block;
    }
    span {
      margin-top: 4px;
      color: var(--muted);
      line-height: 1.5;
    }
  `,
})
export class TwitterImportNextSteps {
  private readonly discovery = inject(TwitterFriendDiscovery);
  /** Signed in, the invite builder is the mini-app's own tab. */
  readonly signedIn = input(false);
  protected readonly attempted = computed(() => this.discovery.callCount() > 0);
}
