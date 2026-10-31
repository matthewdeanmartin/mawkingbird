import { Component, effect, inject, input, signal, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Status } from '../models';
import { Auth } from '../auth';
import { Server } from '../server';
import type { MediaDownloadDialog, MediaPageLoader } from './media-download-dialog';

// i18n mediaDownload.open: Download media…
// i18n mediaDownload.openFailed: Couldn't open the download dialog. Try again.

/**
 * The "Download media…" row in a post's or profile's ••• menu. The dialog and
 * its zip library load only when the row is used.
 */
@Component({
  selector: 'app-media-download-menu-item',
  imports: [NgComponentOutlet, TranslocoPipe],
  template: `<button type="button" (click)="open($event)">
      {{ 'mediaDownload.open' | transloco }}
    </button>
    @if (active()) {
      @if (component(); as dialog) {
        <ng-container
          [ngComponentOutlet]="dialog"
          [ngComponentOutletInputs]="{
            statuses: statuses(),
            loadPage: loadPage(),
            scope: scope(),
            archiveName: archiveName(),
            finish,
          }"
        />
      }
      @if (failed()) {
        <p role="alert">{{ 'mediaDownload.openFailed' | transloco }}</p>
      }
    }`,
  // A row in a ••• menu, matching its other entries (see tag-mute-menu).
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
export class MediaDownloadMenuItem {
  readonly statuses = input<Status[]>([]);
  readonly loadPage = input<MediaPageLoader | null>(null);
  readonly scope = input<'post' | 'profile'>('post');
  readonly archiveName = input('media');

  private auth = inject(Auth);
  private server = inject(Server);
  protected active = signal(false);
  protected component = signal<Type<MediaDownloadDialog> | null>(null);
  protected failed = signal(false);
  private menu: HTMLDetailsElement | null = null;

  constructor() {
    let identity: string | undefined;
    effect(() => {
      const next = `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
      if (identity !== undefined && identity !== next) this.active.set(false);
      identity = next;
    });
  }

  protected finish = () => {
    this.active.set(false);
    if (this.menu) {
      this.menu.open = false;
      this.menu.querySelector('summary')?.focus();
      this.menu = null;
    }
  };

  protected open(event: Event): void {
    event.stopPropagation();
    // The dialog renders inside the menu, so the menu stays open until it closes.
    this.menu = (event.target as HTMLElement).closest('details');
    this.active.set(true);
    this.failed.set(false);
    void import('./media-download-dialog')
      .then((module) => this.component.set(module.MediaDownloadDialog))
      .catch(() => this.failed.set(true));
  }
}
