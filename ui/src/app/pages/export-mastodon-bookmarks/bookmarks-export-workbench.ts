import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api';
import { MbButton } from '../../design-system/button/button';
import { MbNotice } from '../../design-system/notice/notice';
import { MbRadioGroup } from '../../design-system/radio-group/radio-group';
import { Status } from '../../models';
import { Server } from '../../server';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import { ExportMode, bookmarkFileHtml, exportEntries, sharedLink } from './bookmark-export';

/**
 * The signed-in body of /export-mastodon-bookmarks: read every native Mastodon
 * bookmark, then download them as a bookmark file in one of three shapes.
 *
 * Reading is a walk over 40-a-page requests and can be stopped; a stopped walk
 * still exports what it has, and says so.
 */
@Component({
  selector: 'app-bookmarks-export-workbench',
  imports: [FocusedNextSteps, MbButton, MbNotice, MbRadioGroup, RouterLink],
  templateUrl: './bookmarks-export-workbench.html',
  styleUrl: '../focused-apps/focused-page.css',
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
    }
    .extras {
      margin: 0 0 12px;
      padding-left: 20px;
      line-height: 1.6;
    }
    mb-notice {
      display: block;
      margin-top: 12px;
    }
  `,
})
export class BookmarksExportWorkbench {
  private readonly api = inject(Api);
  private readonly server = inject(Server);

  protected readonly bookmarks = signal<Status[]>([]);
  protected readonly reading = signal(false);
  protected readonly read = signal(false);
  /** Stopped before the last page: the export is partial and says so. */
  protected readonly stopped = signal(false);
  protected readonly readError = signal(false);
  protected readonly mode = signal<ExportMode>('unwrapped');
  protected readonly downloaded = signal(false);

  private stopRequested = false;

  protected readonly withLinks = computed(
    () => this.bookmarks().filter((status) => sharedLink(status, this.server.baseUrl())).length,
  );

  protected readonly modes = computed(() => [
    {
      value: 'unwrapped',
      label: `Unwrapped: shared links as the link, other posts as the post (${this.bookmarks().length})`,
    },
    { value: 'links', label: `Links only: just the shared links (${this.withLinks()})` },
    {
      value: 'posts',
      label: `Posts: every bookmark as a link to the post (${this.bookmarks().length})`,
    },
  ]);

  protected readonly entryCount = computed(
    () => exportEntries(this.bookmarks(), this.mode(), this.server.baseUrl()).length,
  );

  protected async readAll(): Promise<void> {
    if (this.reading()) return;
    this.reading.set(true);
    this.read.set(false);
    this.stopped.set(false);
    this.readError.set(false);
    this.downloaded.set(false);
    this.bookmarks.set([]);
    this.stopRequested = false;
    let maxId: string | undefined;
    try {
      for (;;) {
        if (this.stopRequested) {
          this.stopped.set(true);
          break;
        }
        const page = await firstValueFrom(this.api.bookmarksPage(maxId));
        this.bookmarks.update((all) => [...all, ...page.statuses]);
        if (!page.nextMaxId || !page.statuses.length) break;
        maxId = page.nextMaxId;
      }
      this.read.set(true);
    } catch {
      // What was read is kept and still exportable; the notice says it is partial.
      this.readError.set(true);
      this.read.set(this.bookmarks().length > 0);
    } finally {
      this.reading.set(false);
    }
  }

  protected stop(): void {
    this.stopRequested = true;
  }

  protected setMode(value: string): void {
    if (value === 'posts' || value === 'unwrapped' || value === 'links') this.mode.set(value);
  }

  protected download(): void {
    const entries = exportEntries(this.bookmarks(), this.mode(), this.server.baseUrl());
    const html = bookmarkFileHtml(entries, 'Mastodon bookmarks');
    const date = new Date().toISOString().slice(0, 10);
    this.save(html, `mastodon-bookmarks-${this.mode()}-${date}.html`);
    this.downloaded.set(true);
  }

  /** Seam so tests can capture the file without the browser downloading it. */
  protected save(html: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
