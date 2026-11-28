import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPostAction } from '../../design-system/post-actions/post-actions';
import { MbDialog } from '../../design-system/dialog/dialog';
import { Auth } from '../../platform/session/auth';
import { NATIVE_FOLLOW_COLLECT, NATIVE_PROFILES } from '../../platform/session/platform-login';
import {
  NativeProfileFilter,
  NativeProfilePost,
  NativeProfileCursor,
  NativeProfilesResult,
  NativeCollectionStatus,
  NativePeopleCategory,
} from '../../platform/session/native-profile-types';
import { StatusCard } from '../../posts/status-card/status-card';
import { RailOutlet } from '../../shell/rail-outlet';
import { HomeProfilesRail, HomeProfilesRailState } from './home-profiles-rail';
import { SeenWhenScrolled } from '../../reading/rss/seen-when-scrolled';
import { LoadMoreWhenVisible } from './load-more-when-visible';

// i18n pages.homeProfiles.title: Profiles
// i18n pages.homeProfiles.partial: The following scan is still running. People and posts shown here may be incomplete.
// i18n pages.homeProfiles.rescan: Rescan who you follow ({{count}} server calls)
// i18n pages.homeProfiles.rescanning: Reading who you follow…
// i18n pages.homeProfiles.scanned: Following list read {{when}}. People you follow or unfollow in this app are updated by themselves; rescan to pick up changes made elsewhere.
// i18n pages.homeProfiles.next: Next profile
// i18n pages.homeProfiles.fetching: Getting their newest posts…
// i18n pages.homeProfiles.update: Update posts ({{count}} server calls)
// i18n pages.homeProfiles.updating: Updated {{done}} of {{total}} people
// i18n pages.homeProfiles.updateStop: Stop
// i18n pages.homeProfiles.updatePaused: Stopped early: your server is limiting requests. Try again in a few minutes.
// i18n pages.homeProfiles.updateFailed: Could not finish updating. Try again.
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
// i18n pages.homeProfiles.more: More cached posts
// i18n pages.homeProfiles.unread: {{count}} unread
// i18n pages.homeProfiles.postCount: {{count}} cached posts
// i18n pages.homeProfiles.openProfile: Open full profile
// i18n pages.homeProfiles.dataActivity: Data activity
// i18n pages.homeProfiles.dataClose: Close
// i18n pages.homeProfiles.dataRefresh: Refresh status
// i18n pages.homeProfiles.dataIntro: While the app is open, it saves the newest posts of people you follow, a few at a time, closest people first. Update posts catches everyone up now. Opening a person always shows their newest posts.
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
// i18n pages.homeProfiles.job.analytics: Analytics
// i18n pages.homeProfiles.job.idle: Idle

/** A person read this recently is not asked about again when picked. */
const FRESH_FOR_MS = 5 * 60_000;
const FRESHEN_DELAY_MS = 400;
/** People per call to the bulk queue: small, so progress moves and Stop is prompt. */
const UPDATE_BATCH = 5;

@Component({
  selector: 'app-home-profiles',
  imports: [
    DatePipe,
    RouterLink,
    TranslocoPipe,
    MbPostAction,
    MbDialog,
    StatusCard,
    SeenWhenScrolled,
    LoadMoreWhenVisible,
  ],
  template: `
    <section class="profile-reader">
      <header>
        <h1>{{ 'pages.homeProfiles.title' | transloco }}</h1>
        @if (result(); as inventory) {
          @if (!inventory.scanComplete) {
            <p role="status">{{ 'pages.homeProfiles.partial' | transloco }}</p>
          }
        }
      </header>
      <div class="reader-actions">
        <button
          type="button"
          mbPostAction
          (click)="rescan()"
          [disabled]="rescanning() || !!updating()"
        >
          {{
            rescanning()
              ? ('pages.homeProfiles.rescanning' | transloco)
              : ('pages.homeProfiles.rescan' | transloco: { count: rescanCalls() })
          }}
        </button>
        <button type="button" mbPostAction (click)="next()" [disabled]="profiles().length < 2">
          {{ 'pages.homeProfiles.next' | transloco }}
        </button>
        @if (updating(); as run) {
          <span role="status">{{ 'pages.homeProfiles.updating' | transloco: run }}</span>
          <button type="button" mbPostAction (click)="stopUpdate()">
            {{ 'pages.homeProfiles.updateStop' | transloco }}
          </button>
        } @else if (due() && !rescanning()) {
          <button type="button" mbPostAction (click)="update()">
            {{ 'pages.homeProfiles.update' | transloco: { count: due() } }}
          </button>
        }
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
      @if (scannedAt(); as at) {
        <p class="muted small">
          {{ 'pages.homeProfiles.scanned' | transloco: { when: (at * 1000 | date: 'short') } }}
        </p>
      }
      @if (updateProblem(); as problem) {
        <p role="alert">{{ problem | transloco }}</p>
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
            <div class="post-toolbar">
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
            </div>
            @if (postsLoading()) {
              <p role="status">{{ 'pages.homeProfiles.loading' | transloco }}</p>
            }
            @if (freshening()) {
              <p role="status">{{ 'pages.homeProfiles.fetching' | transloco }}</p>
            }
            @if (!postsLoading() && !freshening() && !posts().length) {
              <p>{{ 'pages.homeProfiles.noPosts' | transloco }}</p>
            }
            @for (post of posts(); track post.localId) {
              <article [appSeenWhenScrolled]="!post.isRead" (seen)="queueRead(post)">
                <app-status-card [status]="post.status" />
              </article>
            }
            @if (hasMore()) {
              <button
                type="button"
                mbPostAction
                [disabled]="postsLoading()"
                [appLoadMoreWhenVisible]="!postsLoading()"
                (visible)="loadMore()"
                (click)="loadMore()"
              >
                {{ 'pages.homeProfiles.more' | transloco }}
              </button>
            }
          </section>
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
        margin: 0 0 8px;
      }
      .post-toolbar {
        position: sticky;
        top: 64px;
        z-index: 5;
        background: var(--col-bg);
        border-bottom: 1px solid var(--border);
      }
      .post-toolbar .reader-actions {
        margin: 0 0 4px;
        padding-top: 6px;
      }
      .profile-posts {
        min-width: 0;
      }
      .profile-posts article {
        margin: 0;
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
  protected readonly visibleProfiles = this.railState.visibleProfiles;
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
  /** People due in the bulk queue: one server call each. */
  protected readonly due = signal(0);
  protected readonly updating = signal<{ done: number; total: number } | null>(null);
  protected readonly updateProblem = signal('');
  private readonly collectFollowing = inject(NATIVE_FOLLOW_COLLECT);
  protected readonly rescanning = signal(false);
  /** When the following list was last read, epoch seconds. */
  protected readonly scannedAt = signal<number | null>(null);
  /** Pages of 80 people, then whether each 40 follow back. */
  protected readonly rescanCalls = computed(() => {
    const following = Math.max(1, this.result()?.following ?? 0);
    return Math.ceil(following / 80) + Math.ceil(following / 40);
  });
  /** The picked person's newest page is on its way. */
  protected readonly freshening = signal(false);
  private freshenTimer: ReturnType<typeof setTimeout> | null = null;
  /** When each person was last read live here, by handle and remote id. */
  private readonly freshened = new Map<string, number>();
  protected readonly dataOpen = signal(false);
  protected readonly dataStatus = signal<NativeCollectionStatus | null>(null);
  protected readonly dataError = signal(false);
  private dataTimer: ReturnType<typeof setTimeout> | null = null;
  private readTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingReads = new Map<
    number,
    { handle: string; profileId: number; attempts: number }
  >();
  private savingReads = false;
  private destroyed = false;
  private postRequest = 0;
  private nextCursor: NativeProfileCursor | null = null;
  private listRequest = 0;
  private categoryRequest = 0;
  private listingHandle: string | null = null;

  constructor() {
    this.railState.bind(
      this.railOwner,
      (id) => this.select(id),
      (category) => void this.chooseCategory(category),
    );
    this.rail.show(this.railOwner, {
      left: { component: HomeProfilesRail, labelKey: 'pages.homeProfiles.title' },
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (this.readTimer) clearTimeout(this.readTimer);
      if (this.freshenTimer) clearTimeout(this.freshenTimer);
      this.updating.set(null);
      void this.flushReads();
      this.closeDataActivity();
      this.rail.release(this.railOwner);
      this.railState.release(this.railOwner);
    });
    effect(() => {
      const handle = this.auth.token();
      if (this.auth.kind() === 'mastodon' && handle?.startsWith('native-mastodon:')) {
        if (this.pendingReads.size) void this.flushReads();
        this.closeDataActivity();
        this.dataStatus.set(null);
        this.updating.set(null);
        this.updateProblem.set('');
        this.due.set(0);
        this.scannedAt.set(null);
        this.categoryRequest++;
        this.railState.category.set('all');
        this.railState.members.set(null);
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
      void this.countDue(handle);
      this.profiles.set(result.profiles);
      if (this.railState.category() !== 'all')
        void this.chooseCategory(this.railState.category(), true);
      const visible = this.visibleProfiles();
      const selected = visible.some((p) => p.id === this.selectedId())
        ? this.selectedId()
        : (visible[0]?.id ?? null);
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
    this.nextCursor = null;
    this.hasMore.set(false);
    this.postRequest++;
    this.postsLoading.set(false);
    if (id !== null) void this.loadMore();
    this.freshen();
  }

  /**
   * The saved posts are on screen at once; the picked person's newest page is
   * one ordinary server call, so it is fetched and merged in. A short wait
   * first: paging through people with Next asks only about the one stopped at.
   */
  private freshen(): void {
    if (this.freshenTimer) clearTimeout(this.freshenTimer);
    this.freshenTimer = null;
    this.freshening.set(false);
    const handle = this.auth.token();
    const person = this.selectedProfile();
    if (!handle || !person) return;
    const key = `${handle} ${person.remoteId}`;
    if (Date.now() - (this.freshened.get(key) ?? 0) < FRESH_FOR_MS) return;
    const current = () =>
      !this.destroyed && handle === this.auth.token() && person.id === this.selectedId();
    this.freshening.set(true);
    this.freshenTimer = setTimeout(() => {
      this.freshenTimer = null;
      void this.api
        .fetchAccountPage(handle, person.remoteId, false)
        .then(async () => {
          this.freshened.set(key, Date.now());
          if (current()) await this.mergeNewest(handle, person.id, current);
        })
        .catch(() => undefined) // The saved posts are still there to read.
        .finally(() => {
          if (current()) this.freshening.set(false);
        });
    }, FRESHEN_DELAY_MS);
  }

  private async mergeNewest(handle: string, id: number, current: () => boolean): Promise<void> {
    const filter = this.filter();
    const hideRead = this.hideRead();
    const page = await this.api.postsAfter(handle, id, filter, hideRead, null);
    while (this.postsLoading()) await new Promise((resolve) => setTimeout(resolve, 100));
    if (!current() || filter !== this.filter() || hideRead !== this.hideRead()) return;
    const shown = this.posts();
    const read = new Set(shown.filter((post) => post.isRead).map((post) => post.localId));
    const newest = page.posts.map((post) =>
      read.has(post.localId) ? { ...post, isRead: true } : post,
    );
    if (shown.length <= newest.length) {
      this.posts.set(newest);
      this.nextCursor = page.next;
      this.hasMore.set(page.next !== null);
    } else {
      const ids = new Set(newest.map((post) => post.localId));
      this.posts.set([...newest, ...shown.filter((post) => !ids.has(post.localId))]);
    }
  }

  private async countDue(handle: string): Promise<void> {
    const status = await this.api.collectionStatus(handle).catch(() => null);
    if (!status || this.destroyed || handle !== this.auth.token()) return;
    this.due.set(status.seedEligible);
    this.scannedAt.set(status.following?.updatedAt ?? null);
  }

  /** The background trickle holds the collector for a moment at a time; wait our turn. */
  private async whenFree<T>(work: () => Promise<T>, going: () => boolean): Promise<T> {
    for (let busy = 0; ; busy++) {
      try {
        return await work();
      } catch (error) {
        const kind = (error as { kind?: string } | null)?.kind;
        if (kind !== 'busy' || busy >= 10 || !going()) throw error;
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
  }

  private reportProblem(error: unknown): void {
    this.updateProblem.set(
      (error as { kind?: string } | null)?.kind === 'rate_limit'
        ? 'pages.homeProfiles.updatePaused'
        : 'pages.homeProfiles.updateFailed',
    );
  }

  /** Read the whole following list again: only ever because the reader asked. */
  protected async rescan(): Promise<void> {
    const handle = this.auth.token();
    const collect = this.collectFollowing;
    if (!handle || !collect || this.rescanning() || this.updating()) return;
    const going = () => !this.destroyed && handle === this.auth.token();
    this.updateProblem.set('');
    this.rescanning.set(true);
    try {
      await this.whenFree(() => collect(handle), going);
      if (going()) await this.refresh();
    } catch (error) {
      if (going()) this.reportProblem(error);
    } finally {
      if (!this.destroyed) this.rescanning.set(false);
    }
  }

  /** Work through everyone due, a batch at a time, at the host's pace. */
  protected async update(): Promise<void> {
    const handle = this.auth.token();
    if (!handle || this.updating()) return;
    const run = { done: 0, total: this.due() };
    const going = () => this.updating() !== null && handle === this.auth.token();
    this.updateProblem.set('');
    this.updating.set(run);
    while (going()) {
      try {
        const report = await this.whenFree(() => this.api.seedRecent(handle, UPDATE_BATCH), going);
        if (!going()) return;
        run.done += report.profiles;
        this.due.set(report.remaining);
        this.updating.set({ ...run, total: run.done + report.remaining });
        if (report.rateLimited) this.updateProblem.set('pages.homeProfiles.updatePaused');
        if (report.rateLimited || !report.profiles || !report.remaining) break;
      } catch (error) {
        if (!going()) return;
        this.reportProblem(error);
        break;
      }
    }
    if (!going()) return;
    this.updating.set(null);
    await this.refresh();
  }

  protected stopUpdate(): void {
    this.updating.set(null);
    void this.refresh();
  }

  protected next(): void {
    const rows = this.visibleProfiles();
    const index = rows.findIndex((row) => row.id === this.selectedId());
    if (rows.length) this.select(rows[(index + 1) % rows.length].id);
  }

  protected async chooseCategory(category: NativePeopleCategory, reload = false): Promise<void> {
    if (!reload && category === this.railState.category()) return;
    const request = ++this.categoryRequest;
    const handle = this.auth.token();
    this.railState.category.set(category);
    this.railState.members.set(null);
    if (!handle) return;
    if (category !== 'all') {
      try {
        const members = await this.api.peopleMembers(handle, category);
        if (request !== this.categoryRequest || handle !== this.auth.token()) return;
        this.railState.members.set(new Set(members.map((p) => p.id)));
      } catch {
        if (request === this.categoryRequest) this.error.set(true);
        return;
      }
    }
    const visible = this.visibleProfiles();
    if (!visible.some((p) => p.id === this.selectedId())) this.select(visible[0]?.id ?? null);
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
      const page = await this.api.postsAfter(
        handle,
        id,
        this.filter(),
        this.hideRead(),
        this.nextCursor,
      );
      if (request !== this.postRequest || handle !== this.auth.token()) return;
      this.posts.update((rows) => [...rows, ...page.posts]);
      this.nextCursor = page.next;
      this.hasMore.set(page.next !== null);
    } catch {
      if (request === this.postRequest) this.error.set(true);
    } finally {
      if (request === this.postRequest) this.postsLoading.set(false);
    }
  }

  protected queueRead(post: NativeProfilePost): void {
    const handle = this.auth.token();
    const profileId = this.selectedId();
    if (!handle || profileId === null || post.isRead || this.pendingReads.has(post.localId)) return;
    this.pendingReads.set(post.localId, { handle, profileId, attempts: 0 });
    this.scheduleReadFlush();
  }

  private scheduleReadFlush(delay = 200): void {
    if (this.readTimer || this.savingReads || !this.pendingReads.size || this.destroyed) return;
    this.readTimer = setTimeout(() => {
      this.readTimer = null;
      void this.flushReads();
    }, delay);
  }

  private async flushReads(): Promise<void> {
    if (this.savingReads || !this.pendingReads.size) return;
    if (this.readTimer) clearTimeout(this.readTimer);
    this.readTimer = null;
    const handle = this.pendingReads.values().next().value!.handle;
    const batch = [...this.pendingReads.entries()]
      .filter(([, row]) => row.handle === handle)
      .slice(0, 100);
    for (const [id] of batch) this.pendingReads.delete(id);
    const ids = batch.map(([id]) => id);
    this.savingReads = true;
    try {
      await this.api.markReadBatch(handle, ids);
      if (this.destroyed || handle !== this.auth.token()) return;
      const marked = new Set(ids);
      this.posts.update((rows) =>
        rows.map((row) => (marked.has(row.localId) ? { ...row, isRead: true } : row)),
      );
      const perProfile = new Map<number, number>();
      for (const [, row] of batch)
        perProfile.set(row.profileId, (perProfile.get(row.profileId) ?? 0) + 1);
      this.profiles.update((rows) =>
        rows.map((row) => ({
          ...row,
          cachedUnread: Math.max(0, row.cachedUnread - (perProfile.get(row.id) ?? 0)),
        })),
      );
    } catch {
      for (const [id, row] of batch) {
        if (row.attempts < 2) this.pendingReads.set(id, { ...row, attempts: row.attempts + 1 });
        else if (!this.destroyed) this.error.set(true);
      }
    } finally {
      this.savingReads = false;
      if (this.destroyed && this.pendingReads.size) void this.flushReads();
      else this.scheduleReadFlush(this.pendingReads.size ? 2000 : 200);
    }
  }
}
