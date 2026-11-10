import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, Subscription } from 'rxjs';
import { Auth } from '../../auth';
import { MbButton } from '../../design-system/button/button';
import { Status } from '../../models';
import { MisskeyApi } from '../../providers/misskey/misskey-api';
import { misskeyIdentity } from '../../providers/misskey/misskey-identity-store';
import { StatusCard } from '../../status-card/status-card';

// i18n pages.misskeyTag.loading: Loading…
// i18n pages.misskeyTag.none: No notes with this hashtag yet.
// i18n pages.misskeyTag.failed: Could not load notes for this hashtag.
// i18n pages.misskeyTag.more: Load more
// i18n pages.misskeyTag.search: Search for it instead

/**
 * A hashtag on Misskey (`/tags/:tag` for a Misskey account): the notes your
 * server knows that carry it, newest first, paged by `untilId`. The route
 * picks this page over the Mastodon tag page for Misskey accounts, and
 * hashtags inside Misskey notes link here.
 */
@Component({
  selector: 'app-misskey-tag',
  imports: [RouterLink, TranslocoPipe, MbButton, StatusCard],
  template: `
    <div class="mk-tag">
      <h1 class="mk-tag-title">#{{ tag() }}</h1>
      <p class="mk-tag-search">
        <a routerLink="/search" [queryParams]="{ q: tag() }">{{
          'pages.misskeyTag.search' | transloco
        }}</a>
      </p>
      @if (loading()) {
        <p class="muted center" role="status">{{ 'pages.misskeyTag.loading' | transloco }}</p>
      } @else if (failed()) {
        <p class="center" role="alert">{{ 'pages.misskeyTag.failed' | transloco }}</p>
      } @else {
        @for (status of notes(); track status.id) {
          <app-status-card
            [status]="status"
            (changed)="onChanged($event)"
            (deleted)="onDeleted($event)"
          />
        } @empty {
          <p class="muted center">{{ 'pages.misskeyTag.none' | transloco }}</p>
        }
        @if (!exhausted() && notes().length) {
          <div class="mk-more">
            <button
              mbButton
              variant="outline"
              type="button"
              [disabled]="loadingMore()"
              (click)="more()"
            >
              {{ 'pages.misskeyTag.more' | transloco }}
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .mk-tag-title {
      margin: 12px 16px 4px;
      font-size: 20px;
      overflow-wrap: anywhere;
    }
    .mk-tag-search {
      margin: 0 16px 12px;
    }
    .mk-more {
      display: flex;
      justify-content: center;
      padding: 8px 16px;
    }
  `,
})
export class MisskeyTag implements OnInit, OnDestroy {
  private api = inject(MisskeyApi);
  private auth = inject(Auth);
  private route = inject(ActivatedRoute);

  protected tag = signal('');
  protected notes = signal<Status[]>([]);
  protected loading = signal(true);
  protected loadingMore = signal(false);
  protected failed = signal(false);
  protected exhausted = signal(false);
  private untilId: string | null = null;
  private seq = 0;
  private sub = new Subscription();

  private readonly server = computed(
    () => misskeyIdentity(this.auth.activeMisskeyKey())?.profile.server ?? '',
  );

  ngOnInit(): void {
    this.sub.add(
      this.route.paramMap.subscribe((params) => {
        this.tag.set((params.get('tag') ?? '').replace(/^#/, ''));
        this.notes.set([]);
        this.untilId = null;
        this.exhausted.set(false);
        this.failed.set(false);
        this.loading.set(true);
        const seq = ++this.seq;
        void this.page(seq).finally(() => {
          if (seq === this.seq) this.loading.set(false);
        });
      }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  protected async more(): Promise<void> {
    if (this.loadingMore() || this.exhausted()) return;
    this.loadingMore.set(true);
    try {
      await this.page(this.seq);
    } finally {
      this.loadingMore.set(false);
    }
  }

  private async page(seq: number): Promise<void> {
    try {
      const [found, { adaptMisskeyNote }] = await Promise.all([
        firstValueFrom(this.api.notesByTag(this.tag(), this.untilId)),
        import('../../providers/misskey/misskey-adapter'),
      ]);
      if (seq !== this.seq) return;
      const last = found.at(-1)?.id ?? null;
      this.exhausted.set(!last || last === this.untilId);
      this.untilId = last;
      const server = this.server();
      this.notes.update((list) => [
        ...list,
        ...found.filter((n) => !n.isHidden).map((n) => adaptMisskeyNote(n, server)),
      ]);
    } catch {
      if (seq === this.seq) {
        this.failed.set(true);
        this.exhausted.set(true);
      }
    }
  }

  protected onChanged(updated: Status): void {
    this.notes.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  protected onDeleted(removed: Status): void {
    this.notes.update((list) => list.filter((s) => s.id !== removed.id));
  }
}
