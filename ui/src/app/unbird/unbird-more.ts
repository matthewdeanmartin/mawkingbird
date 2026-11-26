import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbNavigation, MbNavLink } from '../design-system/navigation/navigation';
import { MbSection } from '../design-system/page-header/page-header';
import { AppOnlyLinkRel } from '../public-pages/public-page-urls';
import { UnbirdMatcher } from './unbird-matcher';

// i18n unbird.more.title: There's more you can do with this archive
// i18n unbird.more.label: Unbird
// i18n unbird.more.posts: Replay your best tweets
// i18n unbird.more.postsBody: A few a day, quietly, without pinging anyone.
// i18n unbird.more.archive: Explore your archive
// i18n unbird.more.archiveBody: Search your tweets and likes, see your numbers, keep it as a website.
// i18n unbird.more.profile: Set up your profile
// i18n unbird.more.profileBody: Bring your bio, links and pictures, and tell people you moved.
// i18n unbird.more.people: Find your people
// i18n unbird.more.peopleBody: Everyone from your archive who is on Mastodon, closest first.
// i18n unbird.more.open: Open Unbird
// i18n unbird.more.openBody: All of it in one place. Your archive is already loaded.

export type UnbirdMoreItem = 'people' | 'posts' | 'archive' | 'profile';

/** Where each item goes, and its title and description keys. */
const LINKS: Record<UnbirdMoreItem, { link: string; title: string; body: string }> = {
  people: {
    link: '/unbird/people',
    title: 'unbird.more.people',
    body: 'unbird.more.peopleBody',
  },
  posts: { link: '/unbird/posts', title: 'unbird.more.posts', body: 'unbird.more.postsBody' },
  archive: {
    link: '/unbird/archive',
    title: 'unbird.more.archive',
    body: 'unbird.more.archiveBody',
  },
  profile: {
    link: '/unbird/profile',
    title: 'unbird.more.profile',
    body: 'unbird.more.profileBody',
  },
};

/**
 * The way from the public Twitter pages into the rest of Unbird, shown once an
 * archive is loaded. The archive stays on the device, so it is already there
 * when the visitor arrives; a visitor without an account enters as Anonymous
 * (`auth.guard.ts`), and Posts and Profile ask for a Mastodon account themselves.
 */
@Component({
  selector: 'app-unbird-more',
  imports: [AppOnlyLinkRel, MbNavigation, MbNavLink, MbSection, RouterLink, TranslocoPipe],
  template: `
    @if (matcher.archive()) {
      <mb-section [title]="'unbird.more.title' | transloco">
        <nav mbNavigation [label]="'unbird.more.label' | transloco">
          @for (item of items(); track item) {
            <a mbNavLink [routerLink]="links[item].link">
              <strong>{{ links[item].title | transloco }}</strong>
              <span>{{ links[item].body | transloco }}</span>
            </a>
          }
          <a mbNavLink routerLink="/unbird">
            <strong>{{ 'unbird.more.open' | transloco }}</strong>
            <span>{{ 'unbird.more.openBody' | transloco }}</span>
          </a>
        </nav>
      </mb-section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
    }
    span {
      display: block;
      color: var(--muted);
      font-size: 0.92rem;
    }
  `,
})
export class UnbirdMore {
  protected readonly matcher = inject(UnbirdMatcher);
  protected readonly links = LINKS;
  /** The page the visitor is on already does this one; leave it out. */
  readonly exclude = input<UnbirdMoreItem | null>(null);
  protected readonly items = computed(() =>
    (['posts', 'archive', 'profile', 'people'] as const).filter((item) => item !== this.exclude()),
  );
}
