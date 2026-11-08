import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { routeTranslate } from '../page-language';
import { Observable, firstValueFrom } from 'rxjs';
import { Status } from '../models';
import { Auth } from '../auth';
import { Server } from '../server';
import { MbDialog } from '../design-system/dialog/dialog';
import { MbButton } from '../design-system/button/button';
import { MbCheckbox } from '../design-system/checkbox/checkbox';
import { MbRadioGroup, RadioOption } from '../design-system/radio-group/radio-group';
import {
  DOWNLOAD_MEDIA_TYPES,
  DownloadItem,
  DownloadMediaType,
  FetchedMedia,
  collectMedia,
  eachLimited,
  fetchMedia,
  hasDownloadableMedia,
  saveBlob,
  zipFiles,
} from './media-download';

/**
 * One page of a profile's posts, newest first, older than `cursor`.
 *
 * The profile supplies this because only it knows how to page its source
 * (signed-in API, anonymous public API, provider-native ids).
 */
export type MediaPageLoader = (
  cursor: Status | undefined,
  includeBoosts: boolean,
) => Observable<Status[]>;

// i18n mediaDownload.title: Download media
// i18n mediaDownload.postHint: Save this post's pictures and other media to your device.
// i18n mediaDownload.profileHint: Save media from this profile's recent posts to your device.
// i18n mediaDownload.loadedOnly: This source can't be paged from here, so only posts already loaded on the profile are included.
// i18n mediaDownload.types: Include
// i18n mediaDownload.type.image: Pictures
// i18n mediaDownload.type.gifv: GIFs
// i18n mediaDownload.type.video: Videos
// i18n mediaDownload.type.audio: Audio
// i18n mediaDownload.skipSensitive: Skip posts marked sensitive or with a content warning
// i18n mediaDownload.includeBoosts: Include boosts
// i18n mediaDownload.format: Save as
// i18n mediaDownload.format.zip: One zip file
// i18n mediaDownload.format.files: Separate files
// i18n mediaDownload.format.filesHint: Your browser may ask once whether to allow several downloads.
// i18n mediaDownload.cap: How far back
// i18n mediaDownload.cap.option: Latest {{count}} posts with media
// i18n mediaDownload.start: Download
// i18n mediaDownload.cancel: Stop
// i18n mediaDownload.close: Close
// i18n mediaDownload.again: Change options
// i18n mediaDownload.finding: Finding posts… {{count}} with media so far
// i18n mediaDownload.fetching: Downloading {{done}} of {{total}}…
// i18n mediaDownload.zipping: Making the zip file…
// i18n mediaDownload.nothing: Nothing matched those options.
// i18n mediaDownload.saved: Saved {{count}} files.
// i18n mediaDownload.failedIntro: {{count}} files couldn't be downloaded here, usually because their server doesn't allow other websites to fetch them. Open each link to save it yourself:
// i18n mediaDownload.loadFailed: Couldn't load this profile's posts. Try again.
@Component({
  selector: 'app-media-download-dialog',
  imports: [TranslocoPipe, MbDialog, MbButton, MbCheckbox, MbRadioGroup],
  template: `<mb-dialog
    [title]="'mediaDownload.title' | transloco"
    [closeLabel]="'mediaDownload.close' | transloco"
    [description]="
      (loadPage() || scope() === 'profile' ? 'mediaDownload.profileHint' : 'mediaDownload.postHint')
        | transloco
    "
    [busy]="phase() === 'working'"
    (dismissed)="close()"
  >
    @switch (phase()) {
      @case ('choose') {
        @if (scope() === 'profile' && !loadPage()) {
          <p class="note">{{ 'mediaDownload.loadedOnly' | transloco }}</p>
        }
        <fieldset>
          <legend>{{ 'mediaDownload.types' | transloco }}</legend>
          @for (type of typeOptions; track type) {
            <mb-checkbox
              [label]="'mediaDownload.type.' + type | transloco"
              [checked]="types().has(type)"
              (checkedChange)="setType(type, $event)"
            />
          }
        </fieldset>
        <mb-checkbox
          [label]="'mediaDownload.skipSensitive' | transloco"
          [checked]="skipSensitive()"
          (checkedChange)="skipSensitive.set($event)"
        />
        @if (scope() === 'profile') {
          <mb-checkbox
            [label]="'mediaDownload.includeBoosts' | transloco"
            [checked]="includeBoosts()"
            (checkedChange)="includeBoosts.set($event)"
          />
          @if (loadPage()) {
            <mb-radio-group
              [label]="'mediaDownload.cap' | transloco"
              [options]="capOptions()"
              [value]="'' + cap()"
              (valueChange)="cap.set(+$event)"
            />
          }
        }
        <mb-radio-group
          [label]="'mediaDownload.format' | transloco"
          [options]="formatOptions()"
          [value]="format()"
          (valueChange)="format.set($any($event))"
        />
        @if (error()) {
          <p role="alert">{{ error() | transloco }}</p>
        }
      }
      @case ('working') {
        <p role="status">
          @switch (step()) {
            @case ('finding') {
              {{ 'mediaDownload.finding' | transloco: { count: found() } }}
            }
            @case ('fetching') {
              {{ 'mediaDownload.fetching' | transloco: { done: done(), total: total() } }}
            }
            @case ('zipping') {
              {{ 'mediaDownload.zipping' | transloco }}
            }
          }
        </p>
        @if (total()) {
          <progress [value]="done()" [max]="total()"></progress>
        }
      }
      @case ('done') {
        <!-- "Saved 0 files" above a list of failures says nothing the list doesn't. -->
        @if (saved() || !total()) {
          <p role="status">
            {{
              (total() ? 'mediaDownload.saved' : 'mediaDownload.nothing')
                | transloco: { count: saved() }
            }}
          </p>
        }
        @if (failed().length) {
          <p>{{ 'mediaDownload.failedIntro' | transloco: { count: failed().length } }}</p>
          <ul class="failed">
            @for (item of failed(); track item.filename) {
              <li>
                <a [href]="item.candidates[0]" target="_blank" rel="noopener noreferrer">{{
                  item.filename
                }}</a>
              </li>
            }
          </ul>
        }
      }
    }
    <!-- One footer outside the @switch: a projected slot must be a root node. -->
    <ng-container mbDialogActions>
      @switch (phase()) {
        @case ('choose') {
          <button mbButton type="button" variant="outline" (click)="close()">
            {{ 'common.cancel' | transloco }}
          </button>
          <button mbButton type="button" [disabled]="!types().size" (click)="start()">
            {{ 'mediaDownload.start' | transloco }}
          </button>
        }
        @case ('working') {
          <button mbButton type="button" variant="outline" (click)="stop()">
            {{ 'mediaDownload.cancel' | transloco }}
          </button>
        }
        @case ('done') {
          <button mbButton type="button" variant="outline" (click)="phase.set('choose')">
            {{ 'mediaDownload.again' | transloco }}
          </button>
          <button mbButton type="button" (click)="close()">
            {{ 'mediaDownload.close' | transloco }}
          </button>
        }
      }
    </ng-container>
  </mb-dialog>`,
  styles: `
    fieldset {
      border: 0;
      margin: 0 0 8px;
      padding: 0;
    }
    legend {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .note {
      margin-top: 0;
      font-size: 0.9rem;
    }
    progress {
      width: 100%;
    }
    /* A long failure list scrolls inside the dialog instead of stretching it. */
    .failed {
      max-height: min(40vh, 18rem);
      overflow-y: auto;
      padding-inline-start: 1.25rem;
      overflow-wrap: anywhere;
    }
  `,
})
export class MediaDownloadDialog {
  /** Post scope: the posts to take media from. Also the profile fallback when it can't page. */
  readonly statuses = input<Status[]>([]);
  /** Profile scope: pages older posts on demand. */
  readonly loadPage = input<MediaPageLoader | null>(null);
  readonly scope = input<'post' | 'profile'>('post');
  /** Zip file name without extension. */
  readonly archiveName = input('media');
  readonly finish = input.required<() => void>();

  private auth = inject(Auth);
  private server = inject(Server);
  private document = inject(DOCUMENT);

  protected readonly typeOptions = DOWNLOAD_MEDIA_TYPES;
  protected types = signal<ReadonlySet<DownloadMediaType>>(new Set(['image', 'gifv']));
  protected skipSensitive = signal(false);
  protected includeBoosts = signal(false);
  protected format = signal<'zip' | 'files'>('zip');
  protected cap = signal(40);

  protected phase = signal<'choose' | 'working' | 'done'>('choose');
  protected step = signal<'finding' | 'fetching' | 'zipping'>('finding');
  protected found = signal(0);
  protected done = signal(0);
  protected total = signal(0);
  protected saved = signal(0);
  protected failed = signal<DownloadItem[]>([]);
  protected error = signal('');

  /** Replaced in tests. */
  protected fetcher: typeof fetch = (input, init) => fetch(input, init);
  protected save = (blob: Blob, name: string) => saveBlob(blob, name, this.document);
  /** Gap between separate downloads; browsers drop clicks fired in one burst. */
  protected saveGapMs = 300;

  private controller: AbortController | null = null;

  // Built in code, so they follow the page's pinned language explicitly; the
  // template's pipes do so on their own (see page-language.ts).
  private capLabels = [40, 200, 1000].map((count) => ({
    count,
    label: routeTranslate('mediaDownload.cap.option', { count }),
  }));
  protected readonly capOptions = computed<RadioOption[]>(() =>
    this.capLabels.map(({ count, label }) => ({ value: String(count), label: label() })),
  );
  private zipLabel = routeTranslate('mediaDownload.format.zip');
  private filesLabel = routeTranslate('mediaDownload.format.files');
  private filesHint = routeTranslate('mediaDownload.format.filesHint');
  protected readonly formatOptions = computed<RadioOption[]>(() => [
    { value: 'zip', label: this.zipLabel() },
    { value: 'files', label: this.filesLabel(), hint: this.filesHint() },
  ]);

  constructor() {
    let identity: string | undefined;
    effect(() => {
      const next = `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
      if (identity !== undefined && next !== identity) this.close();
      identity = next;
    });
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
  }

  protected setType(type: DownloadMediaType, checked: boolean): void {
    this.types.update((current) => {
      const next = new Set(current);
      if (checked) next.add(type);
      else next.delete(type);
      return next;
    });
  }

  protected stop(): void {
    this.controller?.abort();
  }

  protected close(): void {
    this.controller?.abort();
    this.finish()();
  }

  async start(): Promise<void> {
    if (this.phase() === 'working' || !this.types().size) return;
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    this.error.set('');
    this.found.set(0);
    this.done.set(0);
    this.total.set(0);
    this.saved.set(0);
    this.failed.set([]);
    this.phase.set('working');
    try {
      this.step.set('finding');
      const statuses = await this.gather(signal);
      const items = collectMedia(statuses, {
        types: this.types(),
        skipSensitive: this.skipSensitive(),
        includeBoosts: this.scope() === 'post' || this.includeBoosts(),
      });
      this.total.set(items.length);
      this.step.set('fetching');
      const fetched: FetchedMedia[] = [];
      const failed: DownloadItem[] = [];
      const blocked = new Set<string>();
      await eachLimited(items, 4, async (item) => {
        const result = await fetchMedia(item, blocked, signal, this.fetcher);
        if (result) fetched.push(result);
        else failed.push(item);
        this.done.update((n) => n + 1);
      });
      if (signal.aborted) throw signal.reason;
      // Keep the reader's order rather than whichever request finished first.
      const order = new Map(items.map((item, index) => [item, index]));
      fetched.sort((a, b) => order.get(a.item)! - order.get(b.item)!);
      failed.sort((a, b) => order.get(a)! - order.get(b)!);
      await this.deliver(fetched, signal);
      this.saved.set(fetched.length);
      this.failed.set(failed);
      this.phase.set('done');
    } catch {
      if (signal.aborted) {
        this.phase.set('choose');
        return;
      }
      this.error.set('mediaDownload.loadFailed');
      this.phase.set('choose');
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private async deliver(files: FetchedMedia[], signal: AbortSignal): Promise<void> {
    if (!files.length) return;
    if (this.format() === 'zip') {
      this.step.set('zipping');
      const zip = await zipFiles(files);
      if (signal.aborted) throw signal.reason;
      const name =
        this.archiveName()
          .replace(/[^a-z0-9_.@-]+/gi, '_')
          .slice(-80) || 'media';
      this.save(zip, `${name}.zip`);
      return;
    }
    for (const [index, { item, blob }] of files.entries()) {
      if (signal.aborted) throw signal.reason;
      if (index) await new Promise((resolve) => setTimeout(resolve, this.saveGapMs));
      this.save(blob, item.filename);
    }
  }

  /**
   * The posts to take media from. A profile pages back until it has `cap`
   * posts with media; with boosts included those pages are mostly text, so the
   * number of requests is bounded too.
   */
  private async gather(signal: AbortSignal): Promise<Status[]> {
    const loader = this.loadPage();
    if (!loader) return this.statuses();
    const cap = this.cap();
    const includeBoosts = this.includeBoosts();
    const maxPages = Math.ceil(cap / 40) * (includeBoosts ? 5 : 1) + 1;
    const withMedia: Status[] = [];
    let cursor: Status | undefined;
    for (let page = 0; page < maxPages && withMedia.length < cap; page++) {
      const batch = await firstValueFrom(loader(cursor, includeBoosts), { defaultValue: [] });
      if (signal.aborted) throw signal.reason;
      if (!batch.length) break;
      cursor = batch.at(-1);
      withMedia.push(...batch.filter(hasDownloadableMedia));
      this.found.set(Math.min(withMedia.length, cap));
    }
    return withMedia.slice(0, cap);
  }
}
