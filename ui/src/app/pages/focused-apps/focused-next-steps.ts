import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** A card in front of the standard ones, for the mini-app's own "keep using this". */
export interface NextStepCard {
  link: string;
  title: string;
  body: string;
}

/**
 * Where to go once a mini-app has done its job: into Mawkingbird proper.
 *
 * The host decides when to show it, always after the task itself, so the page's
 * first ask stays the tool; invitations and the rest of the app come after it.
 */
@Component({
  selector: 'app-focused-next-steps',
  imports: [RouterLink],
  template: `
    <section class="next-steps" aria-labelledby="next-steps-title">
      <h2 id="next-steps-title">Next: make Mawkingbird your everyday Mastodon app</h2>
      <ul>
        @if (lead(); as card) {
          <li>
            <a [routerLink]="card.link">
              <strong>{{ card.title }}</strong>
              <span>{{ card.body }}</span>
            </a>
          </li>
        }
        <li>
          <a routerLink="/home">
            <strong>Open your home feed</strong>
            <span>Posts from the people you follow, newest first.</span>
          </a>
        </li>
        <li>
          <a routerLink="/follow">
            <strong>Follow more people</strong>
            <span>Hand-picked starter kits, grouped by interest.</span>
          </a>
        </li>
        <li>
          <a [routerLink]="inviteLink()">
            <strong>Invite your friends</strong>
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
export class FocusedNextSteps {
  /** The mini-app's own Invite tab when signed in, else the public builder. */
  readonly inviteLink = input('/invites');
  readonly lead = input<NextStepCard | null>(null);
}
