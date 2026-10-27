import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AppDialogs } from '../../app-dialogs';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbMenuItem } from '../../design-system/menu/menu-item';
import { MbPostMenu } from '../../design-system/menu/post-menu';
import {
  CATALOGUE_SOURCES,
  CatalogueItem,
  CatalogueSearch,
  CatalogueSource,
} from './catalogue-search';
import { RadioDock } from './radio-dock';
import { RadioPlayer, RadioTrack } from './radio-player';
import { RadioPlaylists } from './radio-playlists';
import { TrackActions } from './track-actions';

// i18n radio.catalogue.loc: Library of Congress
// i18n radio.catalogue.archive: Internet Archive
// i18n radio.catalogue.source: Catalogue
// i18n radio.catalogue.query: Search recordings
// i18n radio.catalogue.queryHint: Try a song, performer, instrument or place, such as “sea shanty” or “banjo”.
// i18n radio.catalogue.search: Search
// i18n radio.catalogue.searching: Searching…
// i18n radio.catalogue.more: More results
// i18n radio.catalogue.none: No recordings matched. Try fewer or different words.
// i18n radio.catalogue.failed: The catalogue could not be reached. Try again.
// i18n radio.catalogue.select: Select {{title}}
// i18n radio.catalogue.preview: Play
// i18n radio.catalogue.add: Add to playlist
// i18n radio.catalogue.share: Share
// i18n radio.catalogue.append: Add to a published playlist
// i18n radio.catalogue.addSelected: Add {{count}} selected to playlist
// i18n radio.catalogue.playlistSelected: Make a playlist from {{count}} selected
// i18n radio.catalogue.replaceConfirm: Replace the playlist you are building with {{count}} selected recordings?
// i18n radio.catalogue.added: Added {{count}} recordings to the playlist.
// i18n radio.catalogue.unplayable: No playable recording was found in “{{title}}”.
// i18n radio.catalogue.opening: Finding recordings…
// i18n radio.catalogue.open: Open the catalogue page
// i18n radio.catalogue.rights: Rights and reuse
// i18n radio.catalogue.hint: Public catalogues of recordings, many in the public domain. Check each item’s rights before reposting.

/**
 * Search the Library of Congress and the Internet Archive for recordings, then
 * play, share, or collect them into a playlist. Requests go straight to the
 * catalogue; playback is the ordinary audio element.
 */
@Component({
  selector: 'app-catalogue-panel',
  imports: [
    FormsModule,
    TranslocoPipe,
    MbButton,
    MbCheckbox,
    MbField,
    MbControl,
    MbPostMenu,
    MbMenuItem,
  ],
  template: `
    <p class="hint">{{ 'radio.catalogue.hint' | transloco }}</p>
    <form class="query" (ngSubmit)="search()">
      @if (!source()) {
        <mb-field [label]="'radio.catalogue.source' | transloco">
          <select
            mbControl
            name="catalogue"
            [ngModel]="chosen()"
            (ngModelChange)="chosen.set($event)"
          >
            @for (item of sources; track item) {
              <option [value]="item">{{ 'radio.catalogue.' + item | transloco }}</option>
            }
          </select>
        </mb-field>
      }
      <mb-field
        [label]="'radio.catalogue.query' | transloco"
        [hint]="'radio.catalogue.queryHint' | transloco"
      >
        <input
          mbControl
          name="query"
          type="search"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
        />
      </mb-field>
      <button mbButton type="submit" [disabled]="busy() || !query().trim()">
        {{ 'radio.catalogue.search' | transloco }}
      </button>
    </form>
    @if (busy()) {
      <p role="status">{{ 'radio.catalogue.searching' | transloco }}</p>
    }
    @if (failed()) {
      <p role="alert">{{ 'radio.catalogue.failed' | transloco }}</p>
    }
    @if (message()) {
      <p role="status">{{ message() }}</p>
    }
    @if (searched() && !items().length && !busy() && !failed()) {
      <p>{{ 'radio.catalogue.none' | transloco }}</p>
    }
    @if (selected().size) {
      <div class="bulk">
        <button mbButton type="button" [disabled]="opening()" (click)="addSelected()">
          {{ 'radio.catalogue.addSelected' | transloco: { count: selected().size } }}
        </button>
        <button
          mbButton
          variant="outline"
          type="button"
          [disabled]="opening()"
          (click)="playlistSelected()"
        >
          {{ 'radio.catalogue.playlistSelected' | transloco: { count: selected().size } }}
        </button>
      </div>
    }
    <ul class="results">
      @for (item of items(); track item.key) {
        <li>
          @if (item.image) {
            <img [src]="item.image" alt="" loading="lazy" referrerpolicy="no-referrer" />
          }
          <div class="body">
            <mb-checkbox
              [label]="'radio.catalogue.select' | transloco: { title: item.title }"
              [checked]="selected().has(item.key)"
              (checkedChange)="toggle(item, $event)"
            />
            <p class="meta">{{ meta(item) }}</p>
            @if (item.rights) {
              <p class="meta">
                {{ 'radio.catalogue.rights' | transloco }}:
                @if (item.rights.startsWith('https://')) {
                  <a [href]="item.rights" target="_blank" rel="noopener noreferrer">{{
                    item.rights
                  }}</a>
                } @else {
                  {{ item.rights }}
                }
              </p>
            }
            <div class="actions">
              <button
                mbButton
                size="small"
                type="button"
                [disabled]="opening()"
                (click)="preview(item)"
              >
                {{ 'radio.catalogue.preview' | transloco }}
              </button>
              <button
                mbButton
                size="small"
                [variant]="mode() === 'share' ? 'solid' : 'outline'"
                type="button"
                [disabled]="opening()"
                (click)="share(item)"
              >
                {{ 'radio.catalogue.share' | transloco }}
              </button>
              <button
                mbButton
                size="small"
                variant="outline"
                type="button"
                [disabled]="opening()"
                (click)="add(item)"
              >
                {{ 'radio.catalogue.add' | transloco }}
              </button>
              @if (actions.published().length) {
                <mb-post-menu
                  [label]="'radio.catalogue.append' | transloco"
                  [closeLabel]="'radio.closeMenu' | transloco"
                >
                  @for (row of actions.published(); track row.id) {
                    <button mbMenuItem type="button" (click)="append(item, row.id)">
                      {{ row.name }}
                    </button>
                  }
                </mb-post-menu>
              }
              <a [href]="item.page" target="_blank" rel="noopener noreferrer">{{
                'radio.catalogue.open' | transloco
              }}</a>
            </div>
          </div>
        </li>
      }
    </ul>
    @if (more() && !busy()) {
      <button mbButton variant="outline" type="button" (click)="search(page() + 1)">
        {{ 'radio.catalogue.more' | transloco }}
      </button>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }
    .hint,
    .meta {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .query {
      display: flex;
      flex-wrap: wrap;
      align-items: start;
      gap: 12px;
    }
    .query mb-field {
      flex: 1 1 200px;
      min-width: 0;
    }
    .query > button {
      margin-top: 26px;
    }
    .bulk,
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .results {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .results li {
      display: flex;
      gap: 12px;
      padding-block: 8px;
      border-top: 1px solid var(--border);
    }
    .results img {
      flex: none;
      width: 64px;
      height: 64px;
      border-radius: 8px;
      object-fit: cover;
    }
    .body {
      display: grid;
      flex: 1 1 auto;
      gap: 4px;
      min-width: 0;
    }
  `,
})
export class CataloguePanel {
  /** Fixed by the host (Build Playlist's Audio source), or chosen in the panel. */
  readonly source = input<CatalogueSource | null>(null);
  /** `share` (Studio) leads with Share; `build` (Build Playlist) leads with collecting. */
  readonly mode = input<'build' | 'share'>('build');
  readonly sources = CATALOGUE_SOURCES;
  readonly chosen = linkedSignal<CatalogueSource>(() => this.source() ?? 'loc');
  readonly query = signal('');
  readonly items = signal<CatalogueItem[]>([]);
  readonly page = signal(1);
  readonly more = signal(false);
  readonly busy = signal(false);
  readonly failed = signal(false);
  readonly searched = signal(false);
  readonly opening = signal(false);
  readonly message = signal('');
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly actions = inject(TrackActions);
  private readonly catalogue = inject(CatalogueSearch);
  private readonly player = inject(RadioPlayer);
  private readonly playlists = inject(RadioPlaylists);
  private readonly dialogs = inject(AppDialogs);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly resolved = new Map<string, Promise<RadioTrack[]>>();
  private generation = 0;
  private readonly searchedSource = computed(() => this.source() ?? this.chosen());

  constructor() {
    // Playback started here continues in the Radio bar when the reader moves on.
    this.player.installDock(RadioDock);
    this.playlists.refresh();
  }

  async search(page = 1): Promise<void> {
    const generation = ++this.generation;
    this.busy.set(true);
    this.failed.set(false);
    this.message.set('');
    if (page === 1) {
      this.items.set([]);
      this.selected.set(new Set());
    }
    try {
      const result = await this.catalogue.search(this.searchedSource(), this.query(), page);
      if (generation !== this.generation) return;
      this.items.update((items) => (page === 1 ? result.items : [...items, ...result.items]));
      this.page.set(page);
      this.more.set(result.more);
      this.searched.set(true);
    } catch {
      if (generation === this.generation) this.failed.set(true);
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }

  meta(item: CatalogueItem): string {
    return [item.creator, item.date].filter(Boolean).join(' · ');
  }

  toggle(item: CatalogueItem, on: boolean): void {
    this.selected.update((keys) => {
      const next = new Set(keys);
      if (on) next.add(item.key);
      else next.delete(item.key);
      return next;
    });
  }

  async preview(item: CatalogueItem): Promise<void> {
    const [first] = await this.open(item);
    if (first) this.player.playNow(first);
  }
  async share(item: CatalogueItem): Promise<void> {
    const [first] = await this.open(item);
    if (first) this.actions.share(first);
  }
  async add(item: CatalogueItem): Promise<void> {
    const tracks = await this.open(item);
    if (!tracks.length) return;
    this.actions.addToPlaylist(tracks);
    this.message.set(this.transloco.translate('radio.catalogue.added', { count: tracks.length }));
  }
  async append(item: CatalogueItem, rowId: string): Promise<void> {
    const [first] = await this.open(item);
    if (first) this.message.set(await this.actions.append(first, rowId));
  }

  async addSelected(): Promise<void> {
    const tracks = await this.selectedTracks();
    if (!tracks.length) return;
    this.actions.addToPlaylist(tracks);
    this.message.set(this.transloco.translate('radio.catalogue.added', { count: tracks.length }));
    this.selected.set(new Set());
  }

  /** The selection becomes the playlist being built, ready to name and publish. */
  async playlistSelected(): Promise<void> {
    const tracks = await this.selectedTracks();
    if (!tracks.length) return;
    if (
      this.player.queue().length &&
      !(await this.dialogs.confirm(
        this.transloco.translate('radio.catalogue.replaceConfirm', { count: tracks.length }),
      ))
    )
      return;
    this.player.replacePlaylist(tracks);
    this.playlists.active.set(null);
    void this.router.navigate(['/radio'], { queryParams: { view: 'publish' } });
  }

  private async selectedTracks(): Promise<RadioTrack[]> {
    const chosen = this.items().filter((item) => this.selected().has(item.key));
    const tracks: RadioTrack[] = [];
    for (const item of chosen) tracks.push(...(await this.open(item, false)));
    return tracks;
  }

  /** Resolve an item's recordings once; a failure is reported and retried next time. */
  private async open(item: CatalogueItem, report = true): Promise<RadioTrack[]> {
    this.opening.set(true);
    this.message.set(this.transloco.translate('radio.catalogue.opening'));
    let pending = this.resolved.get(item.key);
    if (!pending) {
      pending = this.catalogue.tracks(item);
      this.resolved.set(item.key, pending);
    }
    try {
      const tracks = await pending;
      if (!tracks.length && report)
        this.message.set(
          this.transloco.translate('radio.catalogue.unplayable', { title: item.title }),
        );
      else this.message.set('');
      return tracks;
    } catch {
      this.resolved.delete(item.key);
      this.failed.set(true);
      this.message.set('');
      return [];
    } finally {
      this.opening.set(false);
    }
  }
}
