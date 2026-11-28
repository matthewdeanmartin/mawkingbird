import {
  Component,
  effect,
  inject,
  signal,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPostAction } from '../../design-system/post-actions/post-actions';
import { StatusCard } from '../../posts/status-card/status-card';
import { Auth } from '../../platform/session/auth';
import { AlgoViewTabs } from './algo-view-tabs';
import { NATIVE_FOLLOW_COLLECT, NATIVE_PROFILES } from '../../platform/session/platform-login';
import {
  NativePeopleCategory,
  NativePostBin,
  NativeProfilePost,
} from '../../platform/session/native-profile-types';

// i18n pages.algoPeople.title: Relationships
// i18n pages.algoPeople.refresh: Refresh
// i18n pages.algoPeople.groups: People groups
// i18n pages.algoPeople.nativeSummary: Choose whose posts to read and which kind of post. Results come from this device's cache.
// i18n pages.algoPeople.social: Top friends
// i18n pages.algoPeople.reading: Reading
// i18n pages.algoPeople.readers: Readers
// i18n pages.algoPeople.bots: Bots
// i18n pages.algoPeople.lively: Lively
// i18n pages.algoPeople.zombies: Zombies
// i18n pages.algoPeople.celebrities: Celebrities
// i18n pages.algoPeople.postBins: Post types
// i18n pages.algoPeople.binAll: Main posts
// i18n pages.algoPeople.binStorms: Storms
// i18n pages.algoPeople.binDiscussions: Discussions
// i18n pages.algoPeople.binPictures: Pictures
// i18n pages.algoPeople.binVideos: Videos
// i18n pages.algoPeople.binReposts: Reposts
// i18n pages.algoPeople.nativeCoverage: {{posts}} cached posts shown. {{following}} follows; follow-back checked for {{relationships}}.
// i18n pages.algoPeople.nativePartial: The following scan is still running. Group membership may be incomplete.
// i18n pages.algoPeople.nativeEvidence: Interaction history grows as you read notifications. Missing evidence does not mean someone never interacts.
// i18n pages.algoPeople.nativeEmpty: No cached posts match yet. This group may include people whose posts have not been saved.
// i18n pages.algoPeople.more: More cached posts
// i18n pages.algoPeople.updateEvidence: Update people evidence
// i18n pages.algoPeople.updatingEvidence: Updating people in the background…
// i18n pages.algoPeople.evidenceError: People evidence could not be updated now. The saved posts remain available.
// i18n pages.algoPeople.why.all: Posts by people you follow.
// i18n pages.algoPeople.why.social: Mutual follows with an observed mention, favourite, boost, quote or status notification.
// i18n pages.algoPeople.why.mutuals: People you follow who currently follow you back, where checked.
// i18n pages.algoPeople.why.reading: People you follow who don't follow you back.
// i18n pages.algoPeople.why.readers: People who boosted your posts, including people you do not follow.
// i18n pages.algoPeople.why.bots: Followed accounts explicitly marked as bots.
// i18n pages.algoPeople.why.lively: Followed accounts whose latest known post is within 30 days.
// i18n pages.algoPeople.why.zombies: Followed accounts whose latest known post is older than 90 days. Unknown activity is excluded.
// i18n pages.algoPeople.why.celebrities: Followed accounts with more than 10,000 followers and an observed non-mutual relationship.

@Component({
  selector: 'app-algo-people-native',
  imports: [TranslocoPipe, MbPostAction, StatusCard, AlgoViewTabs],
  template: `
    <section class="people-local">
      <app-algo-view-tabs view="relationships" />
      <h1>{{ 'pages.algoPeople.title' | transloco }}</h1>
      <p>{{ 'pages.algoPeople.nativeSummary' | transloco }}</p>
      <div class="people-toolbar">
        <div
          class="people-filters"
          role="group"
          [attr.aria-label]="'pages.algoPeople.groups' | transloco"
        >
          @for (category of categories; track category) {
            <button
              type="button"
              mbPostAction
              [pressed]="selected() === category"
              (click)="choose(category)"
            >
              {{ 'pages.algoPeople.' + category | transloco }}
            </button>
          }
          <button type="button" mbPostAction [disabled]="loading()" (click)="refresh()">
            {{ 'pages.algoPeople.refresh' | transloco }}
          </button>
          <button type="button" mbPostAction [disabled]="syncing()" (click)="refreshEvidence()">
            {{ 'pages.algoPeople.updateEvidence' | transloco }}
          </button>
        </div>
        <p class="muted small">{{ 'pages.algoPeople.why.' + selected() | transloco }}</p>
        <div
          class="people-filters"
          role="group"
          [attr.aria-label]="'pages.algoPeople.postBins' | transloco"
        >
          @for (bin of bins; track bin) {
            <button
              type="button"
              mbPostAction
              [pressed]="selectedBin() === bin"
              (click)="chooseBin(bin)"
            >
              {{ 'pages.algoPeople.bin' + binLabels[bin] | transloco }}
            </button>
          }
        </div>
      </div>
      @if (syncing()) {
        <p role="status">{{ 'pages.algoPeople.updatingEvidence' | transloco }}</p>
      }
      @if (evidenceError()) {
        <p role="alert">{{ 'pages.algoPeople.evidenceError' | transloco }}</p>
      }
      @if (loading()) {
        <p role="status">{{ 'pages.homeProfiles.loading' | transloco }}</p>
      }
      @if (error()) {
        <p role="alert">{{ 'pages.homeProfiles.error' | transloco }}</p>
      } @else {
        <p class="muted small">
          {{
            'pages.algoPeople.nativeCoverage'
              | transloco
                : {
                    posts: posts().length,
                    following: following(),
                    relationships: relationshipsKnown(),
                  }
          }}
        </p>
        <p class="muted small">{{ 'pages.algoPeople.nativeEvidence' | transloco }}</p>
        @if (!scanComplete()) {
          <p class="muted small">{{ 'pages.algoPeople.nativePartial' | transloco }}</p>
        }
        <div class="people-posts">
          @if (!loading() && !posts().length) {
            <p>{{ 'pages.algoPeople.nativeEmpty' | transloco }}</p>
          }
          @for (post of posts(); track post.localId) {
            <app-status-card [status]="post.status" />
          }
          @if (hasMore() && !loading()) {
            <button type="button" mbPostAction (click)="more()">
              {{ 'pages.algoPeople.more' | transloco }}
            </button>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .people-local {
        padding: 12px 16px;
      }
      .people-local h1 {
        margin: 0 0 8px;
      }
      .people-toolbar {
        position: sticky;
        top: 64px;
        z-index: 5;
        background: var(--col-bg);
        border-bottom: 1px solid var(--border);
      }
      .people-toolbar .people-filters {
        margin: 6px 0;
      }
      .people-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 12px 0;
      }
      .people-posts {
        min-width: 0;
      }
    `,
  ],
})
export class AlgoPeopleNative {
  private readonly auth = inject(Auth);
  private readonly archive = inject(NATIVE_PROFILES)!;
  private readonly collectFollowing = inject(NATIVE_FOLLOW_COLLECT);
  protected readonly categories: readonly NativePeopleCategory[] = [
    'all',
    'social',
    'mutuals',
    'reading',
    'readers',
    'bots',
    'lively',
    'zombies',
    'celebrities',
  ];
  protected readonly bins: readonly NativePostBin[] = [
    'all',
    'storms',
    'discussions',
    'pictures',
    'videos',
    'reposts',
  ];
  protected readonly binLabels: Record<NativePostBin, string> = {
    all: 'All',
    storms: 'Storms',
    discussions: 'Discussions',
    pictures: 'Pictures',
    videos: 'Videos',
    reposts: 'Reposts',
  };
  protected readonly selected = signal<NativePeopleCategory>('all');
  protected readonly selectedBin = signal<NativePostBin>('all');
  protected readonly posts = signal<NativeProfilePost[]>([]);
  protected readonly following = signal(0);
  protected readonly relationshipsKnown = signal(0);
  protected readonly scanComplete = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly syncing = signal(false);
  protected readonly evidenceError = signal(false);
  private request = 0;

  constructor() {
    effect(() => {
      const handle = this.auth.token();
      if (this.auth.kind() === 'mastodon' && handle?.startsWith('native-mastodon:')) {
        untracked(() => void this.refresh());
      }
    });
  }

  protected choose(category: NativePeopleCategory): void {
    if (category === this.selected()) return;
    this.selected.set(category);
    void this.refresh();
  }

  protected chooseBin(bin: NativePostBin): void {
    if (bin === this.selectedBin()) return;
    this.selectedBin.set(bin);
    void this.refresh();
  }

  protected async refreshEvidence(): Promise<void> {
    const handle = this.auth.token();
    if (!handle || !this.collectFollowing || this.syncing()) return;
    this.syncing.set(true);
    this.evidenceError.set(false);
    try {
      await this.collectFollowing(handle);
      if (handle === this.auth.token()) await this.refresh();
    } catch {
      if (handle === this.auth.token()) this.evidenceError.set(true);
    } finally {
      this.syncing.set(false);
    }
  }

  protected refresh(): Promise<void> {
    return this.load(0);
  }

  protected more(): Promise<void> {
    return this.load(this.posts().length);
  }

  private async load(offset: number): Promise<void> {
    const handle = this.auth.token();
    if (!handle) return;
    const request = ++this.request;
    const category = this.selected();
    const bin = this.selectedBin();
    if (offset === 0) {
      this.posts.set([]);
      this.following.set(0);
      this.relationshipsKnown.set(0);
      this.scanComplete.set(false);
      this.hasMore.set(false);
    }
    this.loading.set(true);
    this.error.set(false);
    try {
      const result = await this.archive.peoplePosts(handle, category, bin, offset);
      if (
        request !== this.request ||
        handle !== this.auth.token() ||
        category !== this.selected() ||
        bin !== this.selectedBin()
      )
        return;
      this.posts.set(offset === 0 ? result.posts : [...this.posts(), ...result.posts]);
      this.following.set(result.following);
      this.relationshipsKnown.set(result.relationshipsKnown);
      this.scanComplete.set(result.scanComplete);
      this.hasMore.set(result.posts.length === 40 && offset + result.posts.length <= 5000);
    } catch {
      if (request === this.request) this.error.set(true);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
