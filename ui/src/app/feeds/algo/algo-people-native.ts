import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  NativeProfileSummary,
} from '../../platform/session/native-profile-types';

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
// i18n pages.algoPeople.members: People in this group
// i18n pages.algoPeople.memberCount: {{count}} people
// i18n pages.algoPeople.noMembers: No people have matched with the evidence saved so far.
// i18n pages.algoPeople.morePeople: More people
// i18n pages.algoPeople.cachedForPerson: {{count}} cached posts
// i18n pages.algoPeople.why.all: Posts by people you follow.
// i18n pages.algoPeople.why.social: Mutual follows with an observed mention, favourite, boost, quote or status notification.
// i18n pages.algoPeople.why.mutuals: People you follow who currently follow you back, where checked.
// i18n pages.algoPeople.why.reading: Followed people observed not following you back. This says nothing about future interaction.
// i18n pages.algoPeople.why.readers: People who boosted your posts, including people you do not follow.
// i18n pages.algoPeople.why.bots: Followed accounts explicitly marked as bots.
// i18n pages.algoPeople.why.lively: Followed accounts whose latest known post is within 30 days.
// i18n pages.algoPeople.why.zombies: Followed accounts whose latest known post is older than 90 days. Unknown activity is excluded.
// i18n pages.algoPeople.why.celebrities: Followed accounts with more than 10,000 followers and an observed non-mutual relationship.

@Component({
  selector: 'app-algo-people-native',
  imports: [TranslocoPipe, MbPostAction, StatusCard, RouterLink, AlgoViewTabs],
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
        <div class="people-grid">
          <nav class="people-members" [attr.aria-label]="'pages.algoPeople.members' | transloco">
            <h2>{{ 'pages.algoPeople.memberCount' | transloco: { count: members().length } }}</h2>
            @if (!loading() && !members().length) {
              <p>{{ 'pages.algoPeople.noMembers' | transloco }}</p>
            }
            @for (person of members().slice(0, memberLimit()); track person.id) {
              <a [routerLink]="['/accounts', person.remoteId]">
                <span>{{ person.displayName || person.acct }}</span>
                <small
                  >&#64;{{ person.acct }} ·
                  {{
                    'pages.algoPeople.cachedForPerson' | transloco: { count: person.cachedPosts }
                  }}</small
                >
              </a>
            }
            @if (members().length > memberLimit()) {
              <button type="button" mbPostAction (click)="memberLimit.set(memberLimit() + 100)">
                {{ 'pages.algoPeople.morePeople' | transloco }}
              </button>
            }
          </nav>
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
        </div>
      }
    </section>
  `,
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
      .people-grid {
        display: grid;
        grid-template-columns: minmax(190px, 260px) minmax(0, 1fr);
        gap: 16px;
      }
      .people-members {
        max-height: 75vh;
        overflow: auto;
      }
      .people-members h2 {
        font-size: 1rem;
        margin: 0 0 8px;
      }
      .people-members a {
        display: block;
        padding: 8px;
      }
      .people-members small {
        display: block;
      }
      .people-posts {
        min-width: 0;
      }
      @media (max-width: 700px) {
        .people-grid {
          grid-template-columns: 1fr;
        }
        .people-members {
          max-height: 220px;
        }
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
  protected readonly members = signal<NativeProfileSummary[]>([]);
  protected readonly memberLimit = signal(100);
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
      this.members.set([]);
      this.memberLimit.set(100);
      this.following.set(0);
      this.relationshipsKnown.set(0);
      this.scanComplete.set(false);
      this.hasMore.set(false);
    }
    this.loading.set(true);
    this.error.set(false);
    try {
      const [result, members] = await Promise.all([
        this.archive.peoplePosts(handle, category, bin, offset),
        offset === 0 ? this.archive.peopleMembers(handle, category) : Promise.resolve(null),
      ]);
      if (
        request !== this.request ||
        handle !== this.auth.token() ||
        category !== this.selected() ||
        bin !== this.selectedBin()
      )
        return;
      this.posts.set(offset === 0 ? result.posts : [...this.posts(), ...result.posts]);
      if (members) this.members.set(members);
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
