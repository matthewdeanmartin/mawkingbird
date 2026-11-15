import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Relationship, Status } from '../../platform/api/models';
import { StatusCard } from '../../posts/status-card/status-card';
import { MbPostAction } from '../../design-system/post-actions/post-actions';
import { TranslocoPipe } from '@jsverse/transloco';

type Category = 'all' | 'mutuals' | 'celebrities' | 'broadcasters';
const MAX_POST_PAGES = 5;

// i18n pages.algoPeople.title: People
// i18n pages.algoPeople.summary: Recent posts sampled from up to five Home pages. These groups describe only people seen in that sample.
// i18n pages.algoPeople.all: All
// i18n pages.algoPeople.mutuals: Mutuals
// i18n pages.algoPeople.celebrities: Celebrities
// i18n pages.algoPeople.broadcasters: Broadcasters
// i18n pages.algoPeople.loading: Sampling recent posts…
// i18n pages.algoPeople.empty: No posts in this sample. Try another group or refresh.
// i18n pages.algoPeople.error: Could not load the People sample. Try refreshing.
// i18n pages.algoPeople.refresh: Refresh
// i18n pages.algoPeople.coverage: {{posts}} posts from {{pages}} Home pages
// i18n pages.algoPeople.groups: People groups

/** A deliberately bounded browser view. Native's eventual People source is SQLite. */
@Component({
  selector: 'app-algo-people',
  imports: [StatusCard, TranslocoPipe, MbPostAction],
  template: `
    <section class="people-sample">
      <h1>{{ 'pages.algoPeople.title' | transloco }}</h1>
      <p>{{ 'pages.algoPeople.summary' | transloco }}</p>
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
            (click)="selected.set(category)"
          >
            {{ 'pages.algoPeople.' + category | transloco }}
          </button>
        }
        <button type="button" mbPostAction [disabled]="loading()" (click)="refresh()">
          {{ 'pages.algoPeople.refresh' | transloco }}
        </button>
      </div>
      @if (loading()) {
        <p role="status">{{ 'pages.algoPeople.loading' | transloco }}</p>
      } @else if (error()) {
        <p role="alert">{{ 'pages.algoPeople.error' | transloco }}</p>
      } @else {
        <p class="muted small">
          {{ 'pages.algoPeople.coverage' | transloco: { posts: posts().length, pages: pages() } }}
        </p>
        @if (!visible().length) {
          <p>{{ 'pages.algoPeople.empty' | transloco }}</p>
        }
        @for (post of visible(); track post.id) {
          <app-status-card [status]="post" />
        }
      }
    </section>
  `,
  styles: [
    `
      .people-sample {
        padding: 12px 16px;
      }
      .people-sample h1 {
        margin: 0 0 8px;
      }
      .people-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 12px 0;
      }
    `,
  ],
})
export class AlgoPeople implements OnInit {
  private readonly api = inject(Api);
  protected readonly categories: readonly Category[] = [
    'all',
    'mutuals',
    'celebrities',
    'broadcasters',
  ];
  protected readonly selected = signal<Category>('all');
  protected readonly posts = signal<Status[]>([]);
  protected readonly pages = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  private readonly relations = signal<Map<string, Relationship>>(new Map());
  protected readonly visible = computed(() => {
    const category = this.selected();
    const relations = this.relations();
    return this.posts().filter((wrapper) => {
      if (category === 'all') return true;
      const post = wrapper.reblog ?? wrapper;
      const author = post.account;
      const relation = relations.get(author.id);
      if (!relation?.following) return false;
      if (category === 'mutuals') return !!relation.followed_by;
      if (category === 'celebrities')
        return !relation.followed_by && author.followers_count > 10_000;
      return this.isBroadcaster(author.id);
    });
  });

  ngOnInit(): void {
    void this.refresh();
  }

  protected isBroadcaster(id: string): boolean {
    const authored = this.posts()
      .map((wrapper) => wrapper.reblog ?? wrapper)
      .filter((post) => post.account.id === id);
    return (
      authored.length >= 5 &&
      authored.filter((post) => !!post.in_reply_to_id).length / authored.length < 0.2
    );
  }

  protected async refresh(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(false);
    try {
      const posts: Status[] = [];
      const seen = new Set<string>();
      const cursors = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;
      for (; pages < MAX_POST_PAGES; pages++) {
        const page = await firstValueFrom(this.api.homeTimelinePage(cursor));
        for (const post of page.statuses)
          if (!seen.has(post.id)) {
            seen.add(post.id);
            posts.push(post);
          }
        if (!page.nextMaxId || !page.statuses.length || cursors.has(page.nextMaxId)) {
          pages++;
          break;
        }
        cursors.add(page.nextMaxId);
        cursor = page.nextMaxId;
      }
      const ids = [...new Set(posts.map((wrapper) => (wrapper.reblog ?? wrapper).account.id))];
      const relations = new Map<string, Relationship>();
      for (let i = 0; i < ids.length; i += 40) {
        for (const relation of await firstValueFrom(this.api.relationships(ids.slice(i, i + 40)))) {
          relations.set(relation.id, relation);
        }
      }
      this.relations.set(relations);
      this.posts.set(posts);
      this.pages.set(pages);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
