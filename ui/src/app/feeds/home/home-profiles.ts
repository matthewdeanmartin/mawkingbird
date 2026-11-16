import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPostAction } from '../../design-system/post-actions/post-actions';
import { MbDialog } from '../../design-system/dialog/dialog';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import {
  NativeProfileFilter,
  NativeProfilePost,
  NativeProfilesResult,
  NativeCollectionStatus,
} from '../../platform/session/native-profile-types';
import { StatusCard } from '../../posts/status-card/status-card';
import { RailOutlet } from '../../shell/rail-outlet';
import { HomeProfilesRail, HomeProfilesRailState } from './home-profiles-rail';

// i18n pages.homeProfiles.title: Profiles
// i18n pages.homeProfiles.summary: Read followed people one at a time, using posts saved on this device.
// i18n pages.homeProfiles.partial: The following scan is still running. People and posts shown here may be incomplete.
// i18n pages.homeProfiles.cached: Cached posts only. Newer posts may not be here yet.
// i18n pages.homeProfiles.refresh: Refresh people
// i18n pages.homeProfiles.next: Next profile
// i18n pages.homeProfiles.empty: No followed profiles have been saved yet.
// i18n pages.homeProfiles.noPosts: No cached posts match this filter.
// i18n pages.homeProfiles.error: Could not read the local archive. Try again.
// i18n pages.homeProfiles.loading: Reading local archive…
// i18n pages.homeProfiles.groups: Post types
// i18n pages.homeProfiles.all: All
// i18n pages.homeProfiles.replies: Replies
// i18n pages.homeProfiles.boosts: Boosts
// i18n pages.homeProfiles.links: Links
// i18n pages.homeProfiles.media: Media
// i18n pages.homeProfiles.hideRead: Hide already read
// i18n pages.homeProfiles.markRead: Mark read
// i18n pages.homeProfiles.read: Read
// i18n pages.homeProfiles.more: More cached posts
// i18n pages.homeProfiles.unread: {{count}} unread
// i18n pages.homeProfiles.postCount: {{count}} cached posts
// i18n pages.homeProfiles.following: {{count}} followed people found
// i18n pages.homeProfiles.openProfile: Open full profile
// i18n pages.homeProfiles.dataActivity: Data activity
// i18n pages.homeProfiles.dataClose: Close
// i18n pages.homeProfiles.dataRefresh: Refresh status
// i18n pages.homeProfiles.dataIntro: Background collection saves your following list and interaction evidence. A recent seed fetches one page of up to 40 posts from at most 12 followed profiles per app session, only when their last known post was within 90 days. Each seeded profile rests for seven days. Ordinary reading can save more posts.
// i18n pages.homeProfiles.dataRunning: Current job: {{job}}
// i18n pages.homeProfiles.dataPosts: {{posts}} posts saved from {{profiles}} profiles
// i18n pages.homeProfiles.dataEligible: {{count}} active profiles waiting for a recent page
// i18n pages.homeProfiles.dataFollowing: {{count}} followed profiles inventoried; {{old}} known inactive; {{unknown}} activity unknown
// i18n pages.homeProfiles.dataFollowComplete: Following inventory complete
// i18n pages.homeProfiles.dataFollowPartial: Following inventory partial
// i18n pages.homeProfiles.dataNotificationsComplete: Older notification backfill complete; recent notifications refresh on app start.
// i18n pages.homeProfiles.dataNotificationsPartial: Older notification backfill is still in progress.
// i18n pages.homeProfiles.dataCalls: Background page API calls
// i18n pages.homeProfiles.dataSaved: Saved items
// i18n pages.homeProfiles.dataCounterNote: Following and relationship counts are processed profiles; notification and recent-post counts are newly saved items. Calls include retries but exclude ordinary reading.
// i18n pages.homeProfiles.dataOutcome: Last result
// i18n pages.homeProfiles.outcome.requesting: Requesting
// i18n pages.homeProfiles.outcome.saved: Saved
// i18n pages.homeProfiles.outcome.network: Network error
// i18n pages.homeProfiles.outcome.rate_limit: Rate limited
// i18n pages.homeProfiles.outcome.provider: Server declined
// i18n pages.homeProfiles.dataUpdated: Last update
// i18n pages.homeProfiles.dataFailed: Could not read collector status.
// i18n pages.homeProfiles.job.following: Following
// i18n pages.homeProfiles.job.relationships: Relationships
// i18n pages.homeProfiles.job.notifications: Notifications
// i18n pages.homeProfiles.job.recent_seed: Recent posts
// i18n pages.homeProfiles.job.idle: Idle

@Component({
  selector: 'app-home-profiles',
  imports: [DatePipe, RouterLink, TranslocoPipe, MbPostAction, MbDialog, StatusCard],
  template: `
    <section class="profile-reader">
      <header>
        <h1>{{ 'pages.homeProfiles.title' | transloco }}</h1>
        <p>{{ 'pages.homeProfiles.summary' | transloco }}</p>
        <p>{{ 'pages.homeProfiles.cached' | transloco }}</p>
        @if (result(); as inventory) {
          <p class="muted">
            {{ 'pages.homeProfiles.following' | transloco: { count: inventory.following } }}
          </p>
          @if (!inventory.scanComplete) {
            <p role="status">{{ 'pages.homeProfiles.partial' | transloco }}</p>
          }
        }
      </header>
      <div class="reader-actions">
        <button type="button" mbPostAction (click)="refresh()" [disabled]="listLoading()">
          {{ 'pages.homeProfiles.refresh' | transloco }}
        </button>
        <button type="button" mbPostAction (click)="next()" [disabled]="profiles().length < 2">
          {{ 'pages.homeProfiles.next' | transloco }}
        </button>
        <button type="button" mbPostAction (click)="openDataActivity()">
          {{ 'pages.homeProfiles.dataActivity' | transloco }}
        </button>
      </div>
      @if (dataOpen()) {
        <mb-dialog
          [title]="'pages.homeProfiles.dataActivity' | transloco"
          [closeLabel]="'pages.homeProfiles.dataClose' | transloco"
          [closeOnBackdrop]="true"
          (dismissed)="closeDataActivity()"
        >
          <p>{{ 'pages.homeProfiles.dataIntro' | transloco }}</p>
          @if (dataStatus(); as status) {
            <p>
              {{
                'pages.homeProfiles.dataRunning'
                  | transloco: { job: ('pages.homeProfiles.job.' + status.currentJob | transloco) }
              }}
            </p>
            <p>
              {{
                'pages.homeProfiles.dataPosts'
                  | transloco: { posts: status.cachedPosts, profiles: status.profilesWithPosts }
              }}
            </p>
            <p>
              {{ 'pages.homeProfiles.dataEligible' | transloco: { count: status.seedEligible } }}
            </p>
            @if (status.following; as follow) {
              <p>
                {{
                  'pages.homeProfiles.dataFollowing'
                    | transloco
                      : {
                          count: follow.following,
                          old: follow.knownZombies,
                          unknown: follow.unknownActivity,
                        }
                }}
              </p>
              <p>
                {{
                  (follow.complete
                    ? 'pages.homeProfiles.dataFollowComplete'
                    : 'pages.homeProfiles.dataFollowPartial'
                  ) | transloco
                }}
              </p>
            }
            <p>
              {{
                (status.notificationHistoryComplete
                  ? 'pages.homeProfiles.dataNotificationsComplete'
                  : 'pages.homeProfiles.dataNotificationsPartial'
                ) | transloco
              }}
            </p>
            <div class="data-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'pages.homeProfiles.dataActivity' | transloco }}</th>
                    <th scope="col">{{ 'pages.homeProfiles.dataCalls' | transloco }}</th>
                    <th scope="col">{{ 'pages.homeProfiles.dataSaved' | transloco }}</th>
                    <th scope="col">{{ 'pages.homeProfiles.dataOutcome' | transloco }}</th>
                    <th scope="col">{{ 'pages.homeProfiles.dataUpdated' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (job of status.jobs; track job.job) {
                    <tr>
                      <th scope="row">{{ 'pages.homeProfiles.job.' + job.job | transloco }}</th>
                      <td>{{ job.apiCalls }}</td>
                      <td>{{ job.savedItems }}</td>
                      <td>{{ 'pages.homeProfiles.outcome.' + job.lastOutcome | transloco }}</td>
                      <td>{{ job.updatedAt * 1000 | date: 'short' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="muted">{{ 'pages.homeProfiles.dataCounterNote' | transloco }}</p>
          }
          @if (dataError()) {
            <p role="alert">{{ 'pages.homeProfiles.dataFailed' | transloco }}</p>
          }
          <div mbDialogActions>
            <button type="button" mbPostAction (click)="refreshDataActivity()">
              {{ 'pages.homeProfiles.dataRefresh' | transloco }}
            </button>
          </div>
        </mb-dialog>
      }
      @if (error()) {
        <p role="alert">{{ 'pages.homeProfiles.error' | transloco }}</p>
      }
      @if (listLoading()) {
        <p role="status">{{ 'pages.homeProfiles.loading' | transloco }}</p>
      }
      @if (!listLoading() && !profiles().length) {
        <p>{{ 'pages.homeProfiles.empty' | transloco }}</p>
      }
      <div class="reader-grid">
        @if (selectedId() !== null) {
          <section class="profile-posts">
            @if (selectedProfile(); as selected) {
              <a [routerLink]="['/accounts', selected.remoteId]">{{
                'pages.homeProfiles.openProfile' | transloco
              }}</a>
            }
            <div
              class="reader-actions"
              role="group"
              [attr.aria-label]="'pages.homeProfiles.groups' | transloco"
            >
              @for (kind of filters; track kind) {
                <button
                  type="button"
                  mbPostAction
                  [pressed]="filter() === kind"
                  (click)="changeFilter(kind)"
                >
                  {{ 'pages.homeProfiles.' + kind | transloco }}
                </button>
              }
            </div>
            <label class="read-toggle"
              ><input type="checkbox" [checked]="hideRead()" (change)="toggleHideRead()" />
              {{ 'pages.homeProfiles.hideRead' | transloco }}</label
            >
            @if (postsLoading()) {
              <p role="status">{{ 'pages.homeProfiles.loading' | transloco }}</p>
            }
            @if (!postsLoading() && !posts().length) {
              <p>{{ 'pages.homeProfiles.noPosts' | transloco }}</p>
            }
            @for (post of posts(); track post.localId) {
              <article>
                <app-status-card [status]="post.status" />
                <button
                  type="button"
                  mbPostAction
                  [disabled]="post.isRead"
                  (click)="markRead(post)"
                >
                  {{
                    (post.isRead ? 'pages.homeProfiles.read' : 'pages.homeProfiles.markRead')
                      | transloco
                  }}
                </button>
              </article>
            }
            @if (hasMore()) {
              <button type="button" mbPostAction [disabled]="postsLoading()" (click)="loadMore()">
                {{ 'pages.homeProfiles.more' | transloco }}
              </button>
            }
          </section>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .profile-reader {
        padding: 16px;
      }
      .profile-reader h1 {
        margin: 0 0 8px;
      }
      .reader-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0;
      }
      .reader-grid {
        min-width: 0;
      }
      .read-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
      }
      .profile-posts {
        min-width: 0;
      }
      .profile-posts article {
        margin-bottom: 16px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .data-table-scroll {
        overflow-x: auto;
      }
      th,
      td {
        padding: 6px;
        text-align: left;
        border-bottom: 1px solid var(--border);
      }
    `,
  ],
})
export class HomeProfiles {
  private readonly auth = inject(Auth);
  private readonly api = inject(NATIVE_PROFILES)!;
  private readonly rail = inject(RailOutlet);
  private readonly railState = inject(HomeProfilesRailState);
  private readonly railOwner = {};
  protected readonly filters: readonly NativeProfileFilter[] = [
    'all',
    'replies',
    'boosts',
    'links',
    'media',
  ];
  protected readonly result = signal<NativeProfilesResult | null>(null);
  protected readonly profiles = this.railState.profiles;
  protected readonly selectedId = this.railState.selectedId;
  protected readonly selectedProfile = computed(() =>
    this.profiles().find((profile) => profile.id === this.selectedId()),
  );
  protected readonly filter = signal<NativeProfileFilter>('all');
  protected readonly hideRead = signal(false);
  protected readonly posts = signal<NativeProfilePost[]>([]);
  protected readonly listLoading = signal(false);
  protected readonly postsLoading = signal(false);
  protected readonly error = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly dataOpen = signal(false);
  protected readonly dataStatus = signal<NativeCollectionStatus | null>(null);
  protected readonly dataError = signal(false);
  private dataTimer: ReturnType<typeof setTimeout> | null = null;
  private postRequest = 0;
  private loadedOffset = 0;
  private listRequest = 0;
  private listingHandle: string | null = null;

  constructor() {
    this.railState.bind(this.railOwner, (id) => this.select(id));
    this.rail.show(this.railOwner, {
      right: { component: HomeProfilesRail, labelKey: 'pages.homeProfiles.title' },
    });
    inject(DestroyRef).onDestroy(() => {
      this.closeDataActivity();
      this.rail.release(this.railOwner);
      this.railState.release(this.railOwner);
    });
    effect(() => {
      const handle = this.auth.token();
      if (this.auth.kind() === 'mastodon' && handle?.startsWith('native-mastodon:')) {
        this.closeDataActivity();
        this.dataStatus.set(null);
        this.profiles.set([]);
        this.selectedId.set(null);
        this.posts.set([]);
        untracked(() => void this.refresh());
      }
    });
  }

  protected openDataActivity(): void {
    this.dataOpen.set(true);
    void this.refreshDataActivity();
  }

  protected closeDataActivity(): void {
    this.dataOpen.set(false);
    if (this.dataTimer) clearTimeout(this.dataTimer);
    this.dataTimer = null;
  }

  protected async refreshDataActivity(): Promise<void> {
    const handle = this.auth.token();
    if (!handle || !this.dataOpen()) return;
    if (this.dataTimer) clearTimeout(this.dataTimer);
    this.dataTimer = null;
    try {
      const status = await this.api.collectionStatus(handle);
      if (!this.dataOpen() || handle !== this.auth.token()) return;
      this.dataStatus.set(status);
      this.dataError.set(false);
    } catch {
      if (this.dataOpen() && handle === this.auth.token()) this.dataError.set(true);
    } finally {
      if (this.dataOpen() && handle === this.auth.token())
        this.dataTimer = setTimeout(() => void this.refreshDataActivity(), 3000);
    }
  }

  protected async refresh(): Promise<void> {
    const handle = this.auth.token();
    if (!handle || (this.listLoading() && this.listingHandle === handle)) return;
    const request = ++this.listRequest;
    this.listingHandle = handle;
    this.listLoading.set(true);
    this.error.set(false);
    try {
      const result = await this.api.list(handle);
      if (request !== this.listRequest || handle !== this.auth.token()) return;
      this.result.set(result);
      this.profiles.set(result.profiles);
      const selected = result.profiles.some((p) => p.id === this.selectedId())
        ? this.selectedId()
        : (result.profiles[0]?.id ?? null);
      if (selected !== this.selectedId()) this.select(selected);
    } catch {
      if (request === this.listRequest) this.error.set(true);
    } finally {
      if (request === this.listRequest) this.listLoading.set(false);
    }
  }

  protected select(id: number | null): void {
    this.selectedId.set(id);
    this.posts.set([]);
    this.loadedOffset = 0;
    this.hasMore.set(false);
    this.postRequest++;
    this.postsLoading.set(false);
    if (id !== null) void this.loadMore();
  }

  protected next(): void {
    const rows = this.profiles();
    const index = rows.findIndex((row) => row.id === this.selectedId());
    if (rows.length) this.select(rows[(index + 1) % rows.length].id);
  }

  protected changeFilter(kind: NativeProfileFilter): void {
    this.filter.set(kind);
    this.select(this.selectedId());
  }

  protected toggleHideRead(): void {
    this.hideRead.update((value) => !value);
    this.select(this.selectedId());
  }

  protected async loadMore(): Promise<void> {
    const handle = this.auth.token();
    const id = this.selectedId();
    if (!handle || id === null || this.postsLoading()) return;
    const request = ++this.postRequest;
    this.postsLoading.set(true);
    try {
      const page = await this.api.posts(
        handle,
        id,
        this.filter(),
        this.hideRead(),
        this.loadedOffset,
      );
      if (request !== this.postRequest || handle !== this.auth.token()) return;
      this.posts.update((rows) => [...rows, ...page]);
      this.loadedOffset += page.length;
      this.hasMore.set(page.length === 40);
    } catch {
      if (request === this.postRequest) this.error.set(true);
    } finally {
      if (request === this.postRequest) this.postsLoading.set(false);
    }
  }

  protected async markRead(post: NativeProfilePost): Promise<void> {
    const handle = this.auth.token();
    const profileId = this.selectedId();
    if (!handle || post.isRead) return;
    try {
      await this.api.markRead(handle, post.localId);
      if (handle !== this.auth.token()) return;
      if (profileId === this.selectedId()) {
        this.posts.update((rows) =>
          rows
            .filter((row) => !this.hideRead() || row.localId !== post.localId)
            .map((row) => (row.localId === post.localId ? { ...row, isRead: true } : row)),
        );
      }
      this.profiles.update((rows) =>
        rows.map((row) =>
          row.id === profileId ? { ...row, cachedUnread: Math.max(0, row.cachedUnread - 1) } : row,
        ),
      );
      if (this.hideRead() && profileId === this.selectedId()) this.select(profileId);
    } catch {
      this.error.set(true);
    }
  }
}
