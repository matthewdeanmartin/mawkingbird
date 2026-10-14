import { Component, computed, effect, inject, input, signal, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { normalizeHashtag } from '../hashtag';
import type { TagFilterDialog } from './tag-filter-dialog';
import { Auth } from '../auth';
import { Server } from '../server';

// i18n tagFilter.mute: Mute #{{tag}}…
// i18n tagFilter.muteMany: Mute a hashtag ({{count}})

/** Up to this many tags get a row each; more collapse behind one toggle row. */
const INLINE_TAGS = 4;
let nextId = 0;

@Component({
  selector: 'app-tag-mute-menu',
  imports: [NgComponentOutlet, TranslocoPipe],
  template: `@if (collapsible()) {
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="listId"
        (click)="toggle($event)"
      >
        <span aria-hidden="true">{{ expanded() ? '▾' : '▸' }}</span>
        {{ 'tagFilter.muteMany' | transloco: { count: tags().length } }}
      </button>
      @if (expanded()) {
        <div class="many" [id]="listId">
          @for (tag of tags(); track tag) {
            <button type="button" (click)="open(tag, $event)">
              {{ 'tagFilter.mute' | transloco: { tag } }}
            </button>
          }
        </div>
      }
    } @else {
      @for (tag of tags(); track tag) {
        <button type="button" (click)="open(tag, $event)">
          {{ 'tagFilter.mute' | transloco: { tag } }}
        </button>
      }
    }
    @if (active(); as tag) {
      @if (component(); as dialog) {
        <ng-container [ngComponentOutlet]="dialog" [ngComponentOutletInputs]="{ tag, finish }" />
      }
      @if (failed()) {
        <p role="alert">{{ 'tagFilter.failed' | transloco }}</p>
      }
    }`,
  // Rows in the post's ••• menu, so they match its other entries (see
  // private-like-button) instead of rendering as standalone outline pills.
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
    /* A long tag list scrolls inside its own box instead of stretching the
       whole menu; the indent ties the rows to the toggle that revealed them. */
    .many {
      max-height: min(40vh, 16rem);
      overflow-y: auto;
      padding-inline-start: 12px;
    }
    [role='alert'] {
      margin: 0;
      padding: 4px 9px;
      font-size: 0.85rem;
    }
  `,
})
export class TagMuteMenu {
  private auth = inject(Auth);
  private server = inject(Server);
  constructor() {
    let identity: string | undefined;
    effect(() => {
      const next = `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
      if (identity !== undefined && identity !== next) this.active.set(null);
      identity = next;
    });
  }
  readonly tags = input.required<string[]>();
  protected readonly listId = `tag-mute-list-${nextId++}`;
  protected collapsible = computed(() => this.tags().length > INLINE_TAGS);
  protected expanded = signal(false);
  protected active = signal<string | null>(null);
  protected component = signal<Type<TagFilterDialog> | null>(null);
  protected failed = signal(false);
  private menu: HTMLDetailsElement | null = null;
  protected finish = () => {
    this.active.set(null);
    if (this.menu) {
      this.menu.open = false;
      this.menu.querySelector('summary')?.focus();
      this.menu = null;
    }
  };
  protected toggle(event: Event): void {
    event.stopPropagation();
    this.expanded.update((open) => !open);
  }
  protected open(tag: string, event: Event): void {
    event.stopPropagation();
    const details = (event.target as HTMLElement).closest('details');
    this.menu = details;
    if (details) {
      details.querySelector('summary')?.focus();
    }
    const valid = normalizeHashtag(tag);
    if (!valid) return;
    this.active.set(valid);
    this.failed.set(false);
    void import('./tag-filter-dialog')
      .then((module) => this.component.set(module.TagFilterDialog))
      .catch(() => this.failed.set(true));
  }
}
