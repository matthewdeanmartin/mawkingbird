import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  Type,
  ChangeDetectionStrategy,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { normalizeHashtag } from '../../discovery/hashtag';
import type { TagFilterDialog } from './tag-filter-dialog';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { FilterResult, Status } from '../../platform/api/models';
import { FilterPostDialog } from '../../posts/filter-post-dialog/filter-post-dialog';
import { FilterBuilderMode } from './filter-mode-switch';

// i18n filterBuilder.open: Build filter for post…

/**
 * One "Build filter for post…" row in a post's ••• menu. Simple mutes some of
 * the post's hashtags; Advanced adds this one post to a server filter. The
 * dialog opens on Simple when the post has tags, and switches between the two
 * when both apply. The dialogs render inside the menu, so it stays open until
 * they close.
 */
@Component({
  selector: 'app-post-filter-menu',
  imports: [NgComponentOutlet, TranslocoPipe, FilterPostDialog],
  template: `@if (validTags().length || advanced()) {
      <button type="button" (click)="open($event)">
        {{ 'filterBuilder.open' | transloco }}
      </button>
    }
    @if (mode() === 'simple') {
      @if (component(); as dialog) {
        <ng-container
          [ngComponentOutlet]="dialog"
          [ngComponentOutletInputs]="{
            tags: validTags(),
            finish,
            switchMode: advanced() ? switchMode : null,
          }"
        />
      }
      @if (failed()) {
        <p role="alert">{{ 'tagFilter.failed' | transloco }}</p>
      }
    } @else if (mode() === 'advanced') {
      <app-filter-post-dialog
        [status]="status()"
        [switchMode]="validTags().length ? switchMode : null"
        (filtered)="finish(); filtered.emit($event)"
        (closed)="finish()"
      />
    }`,
  // Rows in the post's ••• menu, so they match its other entries (see
  // private-like-button) instead of rendering as standalone outline pills.
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: contents;
    }
    button {
      display: block;
      width: 100%;
      text-align: left;
      cursor: pointer;
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 7px 9px;
      border-radius: 6px;
    }
    button:hover,
    button:focus-visible {
      background: var(--border);
    }
    [role='alert'] {
      margin: 0;
      padding: 4px 9px;
      font-size: 0.85rem;
    }
  `,
})
export class PostFilterMenu {
  private auth = inject(Auth);
  private server = inject(Server);
  constructor() {
    let identity: string | undefined;
    effect(() => {
      const next = `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
      if (identity !== undefined && identity !== next) this.mode.set(null);
      identity = next;
    });
  }
  /** The post's hashtags, when the reader can mute tags on their server; else empty. */
  readonly tags = input<string[]>([]);
  readonly status = input.required<Status>();
  /** Whether "add this post to a server filter" applies to this post and reader. */
  readonly advanced = input(false);
  readonly filtered = output<FilterResult>();

  /** Mastodon matches keywords case-insensitively, so #Cats and #cats are one row. */
  protected validTags = computed(() => {
    const byKey = new Map<string, string>();
    for (const tag of this.tags()) {
      const valid = normalizeHashtag(tag);
      if (valid && !byKey.has(valid.toLowerCase())) byKey.set(valid.toLowerCase(), valid);
    }
    return [...byKey.values()];
  });
  protected mode = signal<FilterBuilderMode | null>(null);
  protected component = signal<Type<TagFilterDialog> | null>(null);
  protected failed = signal(false);
  private menu: HTMLDetailsElement | null = null;

  protected finish = () => {
    this.mode.set(null);
    if (this.menu) {
      this.menu.open = false;
      this.menu.querySelector('summary')?.focus();
      this.menu = null;
    }
  };

  /** Offered to a dialog only when the other mode also applies. */
  protected switchMode = (mode: FilterBuilderMode) => this.show(mode);

  protected open(event: Event): void {
    event.stopPropagation();
    const details = (event.target as HTMLElement).closest('details');
    this.menu = details;
    details?.querySelector('summary')?.focus();
    this.show(this.validTags().length ? 'simple' : 'advanced');
  }

  private show(mode: FilterBuilderMode): void {
    if (mode === 'simple' && !this.validTags().length) return;
    if (mode === 'advanced' && !this.advanced()) return;
    this.mode.set(mode);
    if (mode !== 'simple' || this.component()) return;
    this.failed.set(false);
    void import('./tag-filter-dialog')
      .then((module) => this.component.set(module.TagFilterDialog))
      .catch(() => this.failed.set(true));
  }
}
