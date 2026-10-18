import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, forkJoin, map, Observable, of, Subscription } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { HumanTimePipe } from '../../human-time.pipe';
import { Status } from '../../models';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { AnonymousTags } from '../../providers/anonymous/anonymous-tags';
import { videoPostsOnly } from '../../providers/videos/video-search';
import { partyTags, partyWatchParams } from '../../providers/videos/watch-parties';
import { Server } from '../../server';
import { StatusCard } from '../../status-card/status-card';

// i18n watchParties.title: Watch parties
// i18n watchParties.intro: A watch party is a hashtag: people post under the same tag while they watch the same video. Pick a tag to see the videos shared under it, then open one on Watch with the tag's conversation beside it. Nothing is created or followed, and the tags last only for that visit.
// i18n watchParties.tags: Party hashtags
// i18n watchParties.tagsHint: One or more, separated by spaces or commas (up to 8).
// i18n watchParties.find: Find parties
// i18n watchParties.followed: Tags you follow
// i18n watchParties.trending: Trending tags
// i18n watchParties.start: Find a watch party
// i18n watchParties.startHint: Enter a hashtag, or pick one you follow or one that is trending.
// i18n watchParties.loading: Looking for videos…
// i18n watchParties.empty: No recent posts with a video under {{tags}}. Parties are informal — try a broader tag, or start one by posting a video with it.
// i18n watchParties.activity: {{count}} recent video posts · latest {{latest}}
// i18n watchParties.open: Open party
// i18n watchParties.cannotPlay: Watch can't play this one
// i18n watchParties.invalid: Use hashtags made of letters, numbers and underscores.

/** Recent posts read per tag: one page of each hashtag timeline. */
const PER_TAG = 40;

/**
 * Finding a watch party, which on Mastodon is only a convention: a video plus a
 * hashtag people post under while they watch it.
 *
 * So this is a hashtag browser tuned for that: the chosen tags' recent public
 * posts, kept to the ones with a video, newest first, each with Open party —
 * Watch for that video with the same tags joined (`?tags=`). The tags are in
 * this page's URL as well, so a party search can be shared. Rough by design;
 * see spec/watch-party.md for what a real room would need.
 */
@Component({
  selector: 'app-watch-parties-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbContentState,
    MbField,
    MbControl,
    HumanTimePipe,
    StatusCard,
  ],
  template: `
    <div class="parties">
      <aside class="party-rail">
        <h1>{{ 'watchParties.title' | transloco }}</h1>
        <p class="muted small">{{ 'watchParties.intro' | transloco }}</p>
        <form (ngSubmit)="submit()">
          <mb-field
            [label]="'watchParties.tags' | transloco"
            [hint]="'watchParties.tagsHint' | transloco"
          >
            <input
              mbControl
              name="tags"
              autocomplete="off"
              maxlength="300"
              [ngModel]="draft()"
              (ngModelChange)="draft.set($event); invalid.set(false)"
            />
          </mb-field>
          @if (invalid()) {
            <p role="alert">{{ 'watchParties.invalid' | transloco }}</p>
          }
          <button mbButton type="submit">{{ 'watchParties.find' | transloco }}</button>
        </form>
        @if (followed().length) {
          <h2>{{ 'watchParties.followed' | transloco }}</h2>
          <div class="tag-list">
            @for (tag of followed(); track tag) {
              <a routerLink="/videos/parties" [queryParams]="{ tags: tag }">#{{ tag }}</a>
            }
          </div>
        }
        @if (trending().length) {
          <h2>{{ 'watchParties.trending' | transloco }}</h2>
          <div class="tag-list">
            @for (tag of trending(); track tag) {
              <a routerLink="/videos/parties" [queryParams]="{ tags: tag }">#{{ tag }}</a>
            }
          </div>
        }
      </aside>

      <section class="party-results" aria-live="polite">
        @if (!tags().length) {
          <mb-content-state
            [title]="'watchParties.start' | transloco"
            [description]="'watchParties.startHint' | transloco"
          />
        } @else if (loading()) {
          <p role="status">{{ 'watchParties.loading' | transloco }}</p>
        } @else {
          <h2>{{ tagLabel() }}</h2>
          @if (posts().length) {
            <p class="muted small">
              {{
                'watchParties.activity'
                  | transloco
                    : { count: posts().length, latest: (posts()[0].created_at | humanTime) }
              }}
            </p>
          }
          @for (post of posts(); track post.id) {
            <article class="party">
              @if (openParams(post); as params) {
                <a mbButton routerLink="/watch" [queryParams]="params">{{
                  'watchParties.open' | transloco
                }}</a>
              } @else {
                <p class="muted small">{{ 'watchParties.cannotPlay' | transloco }}</p>
              }
              <app-status-card [status]="post" (changed)="replace($event)" />
            </article>
          } @empty {
            <p class="muted">{{ 'watchParties.empty' | transloco: { tags: tagLabel() } }}</p>
          }
        }
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .parties {
      display: grid;
      /* The header's tracks, as on /rss, /videos and /videos/search. */
      grid-template-columns: 290px minmax(0, 1fr);
      gap: 16px;
      padding: 16px 0;
      align-items: start;
    }
    .party-rail,
    .party-results {
      padding: 1.2rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--col-bg);
      min-width: 0;
    }
    .party-rail {
      display: grid;
      gap: 0.75rem;
      position: sticky;
      top: 12px;
    }
    form {
      display: grid;
      gap: 0.75rem;
    }
    h1 {
      font-size: 1.4rem;
      margin: 0;
    }
    h2 {
      font-size: 1rem;
      margin: 0.25rem 0 0;
    }
    p {
      margin: 0;
    }
    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 0.75rem;
    }
    .party {
      display: grid;
      gap: 0.5rem;
      justify-items: start;
      padding: 0.75rem 0;
      border-top: 1px solid var(--border);
    }
    .party app-status-card {
      justify-self: stretch;
    }
    @media (max-width: 1000px) {
      .parties {
        grid-template-columns: minmax(0, 1fr);
        padding-inline: 12px;
      }
      .party-rail {
        position: static;
      }
    }
  `,
})
export class WatchPartiesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  private readonly anonymous = inject(AnonymousAccount);
  private readonly publicApi = inject(AnonymousPublicApi);
  private readonly anonymousTags = inject(AnonymousTags);

  protected readonly draft = signal('');
  protected readonly invalid = signal(false);
  protected readonly tags = signal<string[]>([]);
  protected readonly tagLabel = computed(() =>
    this.tags()
      .map((tag) => `#${tag}`)
      .join(' '),
  );
  protected readonly posts = signal<Status[]>([]);
  protected readonly loading = signal(false);
  protected readonly trending = signal<string[]>([]);
  private readonly followedSignedIn = signal<string[]>([]);
  protected readonly followed = computed(() =>
    this.auth.isAnonymous ? [...this.anonymousTags.tags()] : this.followedSignedIn(),
  );

  private request?: Subscription;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const tags = partyTags(params.get('tags') ?? '');
      this.draft.set(tags.join(' '));
      this.find(tags);
    });
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    // Suggestions are a convenience: any failure just leaves the list off.
    if (!this.auth.isAnonymous) {
      this.api
        .followedTags()
        .pipe(
          catchError(() => of([])),
          takeUntilDestroyed(),
        )
        .subscribe((tags) => this.followedSignedIn.set(tags.map((tag) => tag.name).slice(0, 20)));
      this.api
        .trendingTags()
        .pipe(
          catchError(() => of([])),
          takeUntilDestroyed(),
        )
        .subscribe((tags) => this.trending.set(tags.map((tag) => tag.name).slice(0, 12)));
    }
  }

  protected submit(): void {
    const tags = partyTags(this.draft());
    if (!tags.length) {
      this.invalid.set(true);
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tags: tags.join(',') },
    });
  }

  protected openParams(post: Status): Record<string, string> | null {
    return partyWatchParams(post, this.server.baseUrl(), this.tags());
  }

  protected replace(updated: Status): void {
    this.posts.update((posts) => posts.map((post) => (post.id === updated.id ? updated : post)));
  }

  private find(tags: string[]): void {
    this.tags.set(tags);
    this.request?.unsubscribe();
    this.posts.set([]);
    if (!tags.length) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = forkJoin(tags.map((tag) => this.timeline(tag)))
      .pipe(map(videoPostsOnly))
      .subscribe((posts) => {
        this.posts.set(posts);
        this.loading.set(false);
      });
  }

  /** One page of a tag's public timeline; a failing tag contributes nothing. */
  private timeline(tag: string): Observable<Status[]> {
    const request = this.auth.isAnonymous
      ? this.publicApi.getTagTimeline(this.anonymous.server(), tag, undefined, PER_TAG)
      : this.api.tagTimeline(tag, undefined, PER_TAG);
    return request.pipe(catchError(() => of([])));
  }
}
