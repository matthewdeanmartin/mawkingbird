import { Component, effect, inject, input, signal, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { normalizeHashtag } from '../../discovery/hashtag';
import type { TagFilterDialog } from './tag-filter-dialog';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';

// i18n tagFilter.muteTags: Mute tags…

/**
 * One "Mute tags…" row in a post's ••• menu, however many tags the post has.
 * The dialog it opens is where the reader picks which of them to mute.
 */
@Component({
  selector: 'app-tag-mute-menu',
  imports: [NgComponentOutlet, TranslocoPipe],
  template: `<button type="button" (click)="open($event)">
      {{ 'tagFilter.muteTags' | transloco }}
    </button>
    @if (active(); as tags) {
      @if (component(); as dialog) {
        <ng-container [ngComponentOutlet]="dialog" [ngComponentOutletInputs]="{ tags, finish }" />
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
  protected active = signal<string[] | null>(null);
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
  protected open(event: Event): void {
    event.stopPropagation();
    const details = (event.target as HTMLElement).closest('details');
    this.menu = details;
    if (details) {
      details.querySelector('summary')?.focus();
    }
    // Mastodon matches keywords case-insensitively, so #Cats and #cats are one row.
    const byKey = new Map<string, string>();
    for (const tag of this.tags()) {
      const valid = normalizeHashtag(tag);
      if (valid && !byKey.has(valid.toLowerCase())) byKey.set(valid.toLowerCase(), valid);
    }
    const valid = [...byKey.values()];
    if (!valid.length) return;
    this.active.set(valid);
    this.failed.set(false);
    void import('./tag-filter-dialog')
      .then((module) => this.component.set(module.TagFilterDialog))
      .catch(() => this.failed.set(true));
  }
}
