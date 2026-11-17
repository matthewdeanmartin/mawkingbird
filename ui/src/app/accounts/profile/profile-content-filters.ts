import { Component, computed, inject, Injectable, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPostAction } from '../../design-system/post-actions/post-actions';
import { MbRailCard } from '../../design-system/identity/rail-card';
import { Status } from '../../platform/api/models';
import { hasLink } from './profile-search';
import { collectBlogPosts } from '../../blog/blog-classifier';
import { BlogPrefs } from '../../blog/blog-prefs';

/**
 * The profile's rich filters: the expensive cuts a person's history only
 * answers well when much of it is loaded — articles they shared, their images,
 * their long writing — as opposed to the cheap toggles the profile header
 * already has (posts/media, boosts, replies, tags, search). Owner, 2026-11-17:
 * the widget exists to surface those, and works best with Native's full
 * archive; the web gets it on trial over the posts loaded so far.
 */
export type ProfileContentKind =
  | 'all'
  | 'articles'
  | 'links'
  | 'images'
  | 'videos'
  | 'audio'
  | 'longform'
  | 'polls'
  | 'quotes'
  | 'code'
  | 'discussions';

export const PROFILE_CONTENT_KINDS: readonly ProfileContentKind[] = [
  'all',
  'articles',
  'links',
  'images',
  'videos',
  'audio',
  'longform',
  'polls',
  'quotes',
  'code',
  'discussions',
];

function source(post: Status): Status {
  return post.reblog ?? post;
}

function mediaOf(post: Status, ...types: string[]): boolean {
  return (source(post).media_attachments ?? []).some((m) => types.includes(m.type));
}

/**
 * Whether a post belongs to a kind. `longIds` are the posts of the author's
 * storms and long posts, from the Blog classifier; only `longform` reads it.
 */
export function matchesProfileContent(
  post: Status,
  kind: ProfileContentKind,
  longIds: ReadonlySet<string> = new Set(),
): boolean {
  const s = source(post);
  switch (kind) {
    case 'all':
      return true;
    case 'articles':
      // A shared page with a headline: news, essays, blog posts. Not a video.
      return s.card?.type === 'link' && !!s.card.title?.trim();
    case 'links':
      return hasLink(post);
    case 'images':
      return mediaOf(post, 'image', 'gifv');
    case 'videos':
      return mediaOf(post, 'video') || s.card?.type === 'video';
    case 'audio':
      return mediaOf(post, 'audio');
    case 'longform':
      return !post.reblog && longIds.has(post.id);
    case 'polls':
      return !!s.poll;
    case 'quotes':
      return !!s.quote;
    case 'code':
      return /<(?:pre|code)\b/i.test(s.content ?? '');
    case 'discussions':
      return (
        !post.reblog &&
        !!post.in_reply_to_id &&
        !!post.in_reply_to_account_id &&
        post.in_reply_to_account_id !== post.account.id
      );
  }
}

/**
 * What the open profile shares with the rail widget. The profile sets it and
 * clears it; the left rail shows the widget only while `active` and only on a
 * profile address, so it can never linger on Home.
 */
@Injectable({ providedIn: 'root' })
export class ProfileContentState {
  private readonly prefs = inject(BlogPrefs);
  readonly active = signal(false);
  readonly selected = signal<ProfileContentKind>('all');
  readonly posts = signal<Status[]>([]);
  readonly accountId = signal<string | null>(null);
  /** Where the posts came from: the coverage note differs. */
  readonly archived = signal(false);

  /** Posts belonging to the author's storms and long posts. */
  readonly longIds = computed(() => {
    const id = this.accountId();
    if (!id) return new Set<string>();
    const { posts } = collectBlogPosts(this.posts(), id, this.prefs.thresholds(), true);
    return new Set(posts.flatMap((post) => post.chain.map((s) => s.id)));
  });

  readonly counts = computed(() => {
    const longIds = this.longIds();
    return Object.fromEntries(
      PROFILE_CONTENT_KINDS.map((kind) => [
        kind,
        this.posts().filter((post) => matchesProfileContent(post, kind, longIds)).length,
      ]),
    ) as Record<ProfileContentKind, number>;
  });

  private owner: object | null = null;

  /** The open profile takes the widget. Only the current owner can let go. */
  claim(owner: object): void {
    this.owner = owner;
    this.active.set(true);
  }

  release(owner: object): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.active.set(false);
    this.posts.set([]);
  }

  matches(post: Status, kind = this.selected()): boolean {
    return matchesProfileContent(post, kind, this.longIds());
  }
}

// i18n pages.profile.content.title: Find in these posts
// i18n pages.profile.content.all: All
// i18n pages.profile.content.articles: Articles
// i18n pages.profile.content.links: Links
// i18n pages.profile.content.images: Images
// i18n pages.profile.content.videos: Videos
// i18n pages.profile.content.audio: Audio
// i18n pages.profile.content.longform: Long posts
// i18n pages.profile.content.polls: Polls
// i18n pages.profile.content.quotes: Quotes
// i18n pages.profile.content.code: Code
// i18n pages.profile.content.discussions: Discussions
// i18n pages.profile.content.sample: Counts cover the {{count}} posts loaded so far. Load more to look further back.
// i18n pages.profile.content.archive: Counts cover the {{count}} archived posts. Fetch older posts to look further back.

/**
 * The left-rail widget (under the profile card). Kinds with nothing in them
 * are left out, except All and whichever is selected.
 */
@Component({
  selector: 'app-profile-content-filters',
  imports: [TranslocoPipe, MbPostAction, MbRailCard],
  template: `
    <section
      mbRailCard
      class="card profile-content-filters"
      [attr.aria-label]="'pages.profile.content.title' | transloco"
    >
      <h2 class="card-title">{{ 'pages.profile.content.title' | transloco }}</h2>
      <div class="card-body">
        <div
          class="profile-content-actions"
          role="group"
          [attr.aria-label]="'pages.profile.content.title' | transloco"
        >
          @for (kind of shown(); track kind) {
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
        <p class="muted small">
          {{
            (state.archived() ? 'pages.profile.content.archive' : 'pages.profile.content.sample')
              | transloco: { count: state.counts().all }
          }}
        </p>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .card {
        margin-bottom: 12px;
      }
      .card-body {
        padding: 10px 14px 12px;
      }
      .profile-content-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .muted {
        color: var(--muted);
        margin: 8px 0 0;
      }
    `,
  ],
})
export class ProfileContentFilters {
  protected readonly state = inject(ProfileContentState);
  protected readonly shown = computed(() =>
    PROFILE_CONTENT_KINDS.filter(
      (kind) => kind === 'all' || kind === this.state.selected() || this.state.counts()[kind] > 0,
    ),
  );
}
