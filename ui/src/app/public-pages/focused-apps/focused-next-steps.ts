import { Component, inject, input } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppOnlyLinkRel } from '../public-page-urls';

// i18n focusedNextSteps.title: Next: make Mawkingbird your everyday Mastodon app
// i18n focusedNextSteps.home.title: Open your home feed
// i18n focusedNextSteps.home.body: Posts from the people you follow, newest first.
// i18n focusedNextSteps.follow.title: Follow more people
// i18n focusedNextSteps.follow.body: Hand-picked starter kits, grouped by interest.
// i18n focusedNextSteps.invite.title: Invite your friends
// i18n focusedNextSteps.invite.body: Ready-made posts that tell them where to find you.
// i18n focusedNextSteps.features.title: See what else Mawkingbird does
// i18n focusedNextSteps.features.body: Bluesky and RSS, bookmarks, readable articles and writing tools.

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
  imports: [RouterLink, AppOnlyLinkRel, TranslocoPipe],
  template: `
    <section class="next-steps" aria-labelledby="next-steps-title">
      <h2 id="next-steps-title">{{ 'focusedNextSteps.title' | transloco }}</h2>
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
            <strong>{{ 'focusedNextSteps.home.title' | transloco }}</strong>
            <span>{{ 'focusedNextSteps.home.body' | transloco }}</span>
          </a>
        </li>
        <li>
          <a routerLink="/follow">
            <strong>{{ 'focusedNextSteps.follow.title' | transloco }}</strong>
            <span>{{ 'focusedNextSteps.follow.body' | transloco }}</span>
          </a>
        </li>
        <li>
          <a [routerLink]="inviteLink()">
            <strong>{{ 'focusedNextSteps.invite.title' | transloco }}</strong>
            <span>{{ 'focusedNextSteps.invite.body' | transloco }}</span>
          </a>
        </li>
        <li>
          <a routerLink="/features">
            <strong>{{ 'focusedNextSteps.features.title' | transloco }}</strong>
            <span>{{ 'focusedNextSteps.features.body' | transloco }}</span>
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

/**
 * "/<this tool's path>/invite": the Invite tab of the tool page the calling
 * component sits on, English or translated alike. Call in an injection context.
 */
export function toolInviteLink(): string {
  const paths = (inject(ActivatedRoute, { optional: true })?.snapshot?.pathFromRoot ?? [])
    .map((route) => route.routeConfig?.path)
    .filter((path): path is string => !!path);
  return paths.length ? `/${paths.join('/')}/invite` : '/invites';
}
