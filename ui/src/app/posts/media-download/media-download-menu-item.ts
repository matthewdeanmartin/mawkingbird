import { Component, effect, inject, input, signal, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import type { MediaDownloadDialog, MediaPageLoader } from './media-download-dialog';
import { ImageActions, imageFileName } from './image-actions';

// i18n mediaDownload.open: Download media…
// i18n mediaDownload.openFailed: Couldn't open the download dialog. Try again.
// i18n mediaDownload.nativeNone: This post has no pictures to save.

/**
 * The "Download media…" row in a post's or profile's ••• menu. The dialog and
 * its zip library load only when the row is used.
 */
@Component({
  selector: 'app-media-download-menu-item',
  imports: [NgComponentOutlet, TranslocoPipe],
  template: `@if (!nativeSave || scope() === 'post') {
      <button type="button" (click)="open($event)">
        {{ 'mediaDownload.open' | transloco }}
      </button>
    }
    @if (nativeNotice(); as notice) {
      <p role="status">{{ notice }}</p>
    }
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
  private transloco = inject(TranslocoService);
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

  /**
   * Native blocks WebView downloads, so a post's pictures are saved one by one
   * through the OS save dialog instead (parity item 6). Bulk and profile-wide
   * downloads, video and audio are out of scope there, so the profile row is
   * not offered in the native build.
   */
  private readonly images = inject(ImageActions);
  protected readonly nativeSave = this.images.canSave;
  protected nativeNotice = signal('');

  private async saveNative(): Promise<void> {
    const status = this.statuses()[0] ?? null;
    const shown = status ? (status.reblog ?? status) : null;
    const pictures = (shown?.media_attachments ?? []).filter((m) => this.images.isStill(m));
    if (!pictures.length) {
      this.nativeNotice.set(this.transloco.translate('mediaDownload.nativeNone'));
      return;
    }
    for (const [index, media] of pictures.entries()) {
      try {
        const saved = await this.images.save(
          media.url || media.preview_url,
          imageFileName(status, index),
          media.description,
        );
        if (saved === null) return; // Cancelled: stop asking about the rest.
        this.nativeNotice.set(saved);
      } catch (error: unknown) {
        this.nativeNotice.set(error instanceof Error ? error.message : String(error));
        return;
      }
    }
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
    if (this.nativeSave) {
      this.nativeNotice.set('');
      void this.saveNative();
      return;
    }
    // The dialog renders inside the menu, so the menu stays open until it closes.
    this.menu = (event.target as HTMLElement).closest('details');
    this.active.set(true);
    this.failed.set(false);
    void import('./media-download-dialog')
      .then((module) => this.component.set(module.MediaDownloadDialog))
      .catch(() => this.failed.set(true));
  }
}
