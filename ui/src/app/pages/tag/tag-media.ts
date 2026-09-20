import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, Scroll } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { AnonymousProviderRef } from '../../providers/anonymous/anonymous-mastodon-provider';
import { ProfileMediaGrid } from '../profile/media/profile-media-grid';
import { ProfilePhotoView } from '../profile/media/profile-photo-view';
import { buildMediaItems, ProfileMediaItem } from '../profile/media/profile-media-item';

// i18n pages.tag.mediaError: Couldn't load pictures. Try loading more to retry.
@Component({
  selector: 'app-tag-media',
  imports: [ProfileMediaGrid, ProfilePhotoView],
  template: `
    <app-profile-media-grid
      [items]="items()"
      [loading]="loading()"
      [loadingMore]="loading()"
      [exhausted]="exhausted()"
      [error]="error()"
      (more)="loadMore()"
      (opened)="open($event)"
    />
    @if (photo(); as key) {
      <app-profile-photo-view
        [items]="items()"
        [activeKey]="key"
        [publicRef]="publicRef()"
        (closed)="close()"
        (navigated)="open($event, true)"
        (wantMore)="loadMore()"
        (deleted)="remove($event)"
      />
    }
  `,
})
export class TagMedia {
  readonly tag = input.required<string>();
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymous = inject(AnonymousAccount);
  private publicApi = inject(AnonymousPublicApi);
  private router = inject(Router);
  private viewport = inject(ViewportScroller);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private transloco = inject(TranslocoService);
  protected statuses = signal<Status[]>([]);
  protected items = computed(() => buildMediaItems(this.statuses()));
  protected publicRef = computed(() => {
    const status = this.items().find((item) => item.key === this.photo())?.status;
    const ref = status?.providerRef as Partial<AnonymousProviderRef> | undefined;
    return status?.provider === 'anonymous-mastodon' && ref?.statusId
      ? { server: this.anonymous.server(), id: ref.statusId }
      : null;
  });
  protected loading = signal(false);
  protected exhausted = signal(false);
  protected error = signal<string | null>(null);
  protected photo = signal<string | null>(null);
  private cursor: string | undefined;
  private revision = 0;
  private wallPosition: [number, number] | null = null;
  private restoreWall = false;
  private scrollFrame = 0;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const photo = params.get('photo');
      this.restoreWall = !!this.photo() && !photo && params.get('tab') === 'media';
      this.photo.set(photo);
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      // The app defaults route navigation to the top. Closing an overlay (or
      // pressing Back) should instead return to the tile the reader opened.
      if (!(event instanceof Scroll) || !this.restoreWall || !this.wallPosition) return;
      this.restoreWall = false;
      const position = this.wallPosition;
      this.scrollFrame = requestAnimationFrame(() => this.viewport.scrollToPosition(position));
    });
    this.destroyRef.onDestroy(() => cancelAnimationFrame(this.scrollFrame));
    effect(() => {
      const tag = this.tag();
      this.revision++;
      this.wallPosition = null;
      this.cursor = undefined;
      this.statuses.set([]);
      this.exhausted.set(false);
      this.loading.set(false);
      untracked(() => this.fetch(tag));
    });
  }

  protected loadMore(): void {
    this.fetch(this.tag());
  }

  private fetch(tag: string): void {
    if (this.loading() || this.exhausted()) return;
    const revision = this.revision;
    const before = this.cursor;
    this.loading.set(true);
    this.error.set(null);
    const request = this.auth.isAnonymous
      ? this.publicApi.getTagTimeline(this.anonymous.server(), tag, before, 20, true)
      : this.api.tagTimeline(tag, before, 20, true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (statuses) => {
        if (revision !== this.revision) return;
        const last = statuses.at(-1);
        const ref = last?.providerRef as Partial<AnonymousProviderRef> | undefined;
        const cursor = last?.provider === 'anonymous-mastodon' ? ref?.statusId : last?.id;
        this.cursor = cursor;
        const seen = new Set(this.statuses().map((status) => status.id));
        this.statuses.update((current) => [
          ...current,
          ...statuses.filter((status) => !seen.has(status.id)),
        ]);
        // Page the raw response, not the extracted images. Some servers ignore
        // only_media, and a page without visual attachments is not end-of-feed.
        this.exhausted.set(statuses.length < 20 || cursor === before);
        this.loading.set(false);
      },
      error: () => {
        if (revision !== this.revision) return;
        this.error.set(this.transloco.translate('pages.tag.mediaError'));
        this.loading.set(false);
      },
    });
  }

  protected open(item: ProfileMediaItem, replaceUrl = false): void {
    if (!this.photo()) this.wallPosition = this.viewport.getScrollPosition();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'media', photo: item.key },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
  protected close(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { photo: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  protected remove(status: Status): void {
    this.statuses.update((current) => current.filter((item) => item.id !== status.id));
  }
}
