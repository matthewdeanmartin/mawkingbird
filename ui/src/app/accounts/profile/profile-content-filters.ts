import { Component, computed, inject, Injectable, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPostAction } from '../../design-system/post-actions/post-actions';
import { Status } from '../../platform/api/models';
import { hasLink, hasMedia } from './profile-search';

export type ProfileContentKind = 'all' | 'links' | 'media' | 'discussions';
export const PROFILE_CONTENT_KINDS: readonly ProfileContentKind[] = [
  'all',
  'links',
  'media',
  'discussions',
];

export function matchesProfileContent(post: Status, kind: ProfileContentKind): boolean {
  if (kind === 'all') return true;
  if (kind === 'discussions')
    return (
      !!post.in_reply_to_id &&
      !!post.in_reply_to_account_id &&
      post.in_reply_to_account_id !== post.account.id
    );
  return kind === 'links' ? hasLink(post) : hasMedia(post);
}

@Injectable({ providedIn: 'root' })
export class ProfileContentState {
  readonly selected = signal<ProfileContentKind>('all');
  readonly posts = signal<Status[]>([]);
  readonly counts = computed(
    () =>
      Object.fromEntries(
        PROFILE_CONTENT_KINDS.map((kind) => [
          kind,
          this.posts().filter((post) => matchesProfileContent(post, kind)).length,
        ]),
      ) as Record<ProfileContentKind, number>,
  );
}

// i18n pages.profile.content.title: Post types
// i18n pages.profile.content.all: All
// i18n pages.profile.content.links: Links
// i18n pages.profile.content.media: Media
// i18n pages.profile.content.discussions: Discussions
// i18n pages.profile.content.sample: Counts cover the posts loaded so far. Load more to look further back.
@Component({
  selector: 'app-profile-content-filters',
  imports: [TranslocoPipe, MbPostAction],
  template: `
    <section
      class="profile-content-filters"
      [attr.aria-label]="'pages.profile.content.title' | transloco"
    >
      <h2>{{ 'pages.profile.content.title' | transloco }}</h2>
      <div
        class="profile-content-actions"
        role="group"
        [attr.aria-label]="'pages.profile.content.title' | transloco"
      >
        @for (kind of kinds; track kind) {
          <button
            type="button"
            mbPostAction
            [pressed]="state.selected() === kind"
            (click)="state.selected.set(kind)"
          >
            {{ 'pages.profile.content.' + kind | transloco }} ({{ state.counts()[kind] }})
          </button>
        }
      </div>
      <p class="muted small">{{ 'pages.profile.content.sample' | transloco }}</p>
    </section>
  `,
  styles: [
    `
      .profile-content-filters {
        padding: 8px 12px;
      }
      h2 {
        font-size: 1rem;
        margin: 0 0 8px;
      }
      .profile-content-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
    `,
  ],
})
export class ProfileContentFilters {
  protected readonly state = inject(ProfileContentState);
  protected readonly kinds = PROFILE_CONTENT_KINDS;
}
