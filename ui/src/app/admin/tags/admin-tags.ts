import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { AdminApi, AdminTag } from '../admin-api';

// i18n adminShell.hashtags: Hashtags
// i18n adminTags.intro: How this server may use each hashtag. Unticking "usable" hides the tag from search and its timeline; "trendable" lets it trend; "listable" lets it appear in hashtag lists and the directory.
// i18n adminTags.loading: Loading hashtags…
// i18n adminTags.empty: No hashtags yet.
// i18n adminTags.failed: Could not load hashtags.
// i18n adminTags.usable: Usable
// i18n adminTags.trendable: Trendable
// i18n adminTags.listable: Listable
// i18n adminTags.needsReview: Needs review
// i18n adminTags.saveFailed: Not saved; the switch is back where it was.
// i18n adminTags.loadMore: Load more

type TagSwitch = 'usable' | 'trendable' | 'listable';

/** Hashtag review for self-hosted admins (`/api/v1/admin/tags`). */
@Component({
  selector: 'app-admin-tags',
  imports: [MbButton, MbCheckbox, RouterLink, TranslocoPipe],
  template: `
    <p class="muted small intro">{{ 'adminTags.intro' | transloco }}</p>
    @if (state() === 'loading') {
      <p class="muted center">{{ 'adminTags.loading' | transloco }}</p>
    } @else if (state() === 'failed') {
      <p class="muted center">{{ 'adminTags.failed' | transloco }}</p>
    } @else if (!tags().length) {
      <p class="muted center">{{ 'adminTags.empty' | transloco }}</p>
    } @else {
      @for (t of tags(); track t.id) {
        <div class="admin-tag">
          <a class="admin-tag-name" [routerLink]="['/tags', t.name]">#{{ t.name }}</a>
          @if (t.requires_review) {
            <span class="muted small">{{ 'adminTags.needsReview' | transloco }}</span>
          }
          <div class="admin-tag-switches">
            @for (key of switches; track key) {
              <mb-checkbox
                [label]="'adminTags.' + key | transloco"
                [checked]="t[key]"
                [disabled]="busy() === t.id"
                (checkedChange)="set(t, key, $event)"
              />
            }
          </div>
          @if (failed() === t.id) {
            <p class="small" role="alert">{{ 'adminTags.saveFailed' | transloco }}</p>
          }
        </div>
      }
      @if (more()) {
        <button mbButton variant="outline" type="button" class="more" (click)="loadMore()">
          {{ 'adminTags.loadMore' | transloco }}
        </button>
      }
    }
  `,
  styles: `
    .intro {
      margin: 0;
      padding: 12px 16px;
    }
    .admin-tag {
      display: grid;
      gap: 4px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
    }
    .admin-tag-name {
      font-weight: 700;
    }
    .admin-tag-switches {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
    }
    .more {
      display: block;
      margin: 16px auto;
    }
  `,
})
export class AdminTags implements OnInit {
  private readonly api = inject(AdminApi);

  protected readonly switches: readonly TagSwitch[] = ['usable', 'trendable', 'listable'];
  protected readonly tags = signal<AdminTag[]>([]);
  protected readonly state = signal<'loading' | 'loaded' | 'failed'>('loading');
  protected readonly more = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly failed = signal<string | null>(null);

  ngOnInit(): void {
    this.api.tags().subscribe({
      next: (list) => {
        this.tags.set(list);
        this.more.set(list.length >= 50);
        this.state.set('loaded');
      },
      error: () => this.state.set('failed'),
    });
  }

  loadMore(): void {
    const last = this.tags().at(-1);
    if (!last) return;
    this.api.tags(last.id).subscribe({
      next: (list) => {
        this.tags.update((current) => [...current, ...list]);
        this.more.set(list.length >= 50);
      },
      error: () => this.more.set(false),
    });
  }

  /** Instant-apply; a refused change puts the switch back. */
  protected set(tag: AdminTag, key: TagSwitch, value: boolean): void {
    this.busy.set(tag.id);
    this.failed.set(null);
    this.replace({ ...tag, [key]: value });
    this.api.updateTag(tag.id, { [key]: value }).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.replace({ ...tag, ...updated });
      },
      error: () => {
        this.busy.set(null);
        this.replace(tag);
        this.failed.set(tag.id);
      },
    });
  }

  private replace(tag: AdminTag): void {
    this.tags.update((list) => list.map((t) => (t.id === tag.id ? tag : t)));
  }
}
