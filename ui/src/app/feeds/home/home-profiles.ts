import { Component, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPostAction } from '../../design-system/post-actions/post-actions';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import {
  NativeProfileFilter,
  NativeProfilePost,
  NativeProfileSummary,
  NativeProfilesResult,
} from '../../platform/session/native-profile-types';
import { StatusCard } from '../../posts/status-card/status-card';

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

@Component({
  selector: 'app-home-profiles',
  imports: [DatePipe, TranslocoPipe, MbPostAction, StatusCard],
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
      </div>
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
        <nav class="profile-list" [attr.aria-label]="'pages.homeProfiles.title' | transloco">
          @for (profile of profiles(); track profile.id) {
            <button
              type="button"
              [class.selected]="selectedId() === profile.id"
              [attr.aria-current]="selectedId() === profile.id ? 'true' : null"
              (click)="select(profile.id)"
            >
              <strong>{{ profile.displayName || profile.acct }}</strong>
              <span>@{{ profile.acct }}</span>
              @if (profile.lastStatusAt) {
                <time [attr.datetime]="profile.lastStatusAt">{{
                  profile.lastStatusAt | date: 'mediumDate'
                }}</time>
              }
              <small
                >{{ 'pages.homeProfiles.unread' | transloco: { count: profile.cachedUnread } }} ·
                {{
                  'pages.homeProfiles.postCount' | transloco: { count: profile.cachedPosts }
                }}</small
              >
            </button>
          }
        </nav>
        @if (selectedId() !== null) {
          <section class="profile-posts">
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
        display: grid;
        grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
        gap: 16px;
      }
      .profile-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 75vh;
        overflow: auto;
      }
      .profile-list button {
        text-align: left;
        border: 1px solid var(--border-color, #888);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        padding: 8px;
      }
      .profile-list button.selected {
        outline: 2px solid currentColor;
      }
      .profile-list span,
      .profile-list small,
      .profile-list time {
        display: block;
        overflow-wrap: anywhere;
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
      @media (max-width: 700px) {
        .reader-grid {
          grid-template-columns: 1fr;
        }
        .profile-list {
          max-height: 220px;
        }
      }
    `,
  ],
})
export class HomeProfiles {
  private readonly auth = inject(Auth);
  private readonly api = inject(NATIVE_PROFILES)!;
  protected readonly filters: readonly NativeProfileFilter[] = [
    'all',
    'replies',
    'boosts',
    'links',
    'media',
  ];
  protected readonly result = signal<NativeProfilesResult | null>(null);
  protected readonly profiles = signal<NativeProfileSummary[]>([]);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly filter = signal<NativeProfileFilter>('all');
  protected readonly hideRead = signal(false);
  protected readonly posts = signal<NativeProfilePost[]>([]);
  protected readonly listLoading = signal(false);
  protected readonly postsLoading = signal(false);
  protected readonly error = signal(false);
  protected readonly hasMore = signal(false);
  private postRequest = 0;
  private loadedOffset = 0;
  private listRequest = 0;
  private listingHandle: string | null = null;

  constructor() {
    effect(() => {
      const handle = this.auth.token();
      if (this.auth.kind() === 'mastodon' && handle?.startsWith('native-mastodon:')) {
        this.profiles.set([]);
        this.selectedId.set(null);
        this.posts.set([]);
        untracked(() => void this.refresh());
      }
    });
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
