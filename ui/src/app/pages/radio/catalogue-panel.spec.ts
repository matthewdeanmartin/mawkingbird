import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDialogs } from '../../app-dialogs';
import { CataloguePanel } from './catalogue-panel';
import { CatalogueItem, CatalogueSearch } from './catalogue-search';
import { RadioPlayer, RadioTrack } from './radio-player';
import { RadioPlaylists } from './radio-playlists';
import { TrackActions } from './track-actions';

const item = (id: string): CatalogueItem => ({
  key: `loc:${id}`,
  source: 'loc',
  id,
  title: `Song ${id}`,
  creator: 'Singer',
  date: '1939',
  page: `https://www.loc.gov/item/${id}/`,
  image: '',
  rights: 'No known restrictions',
});
const track = (id: string) => ({ key: `t${id}`, media: { id }, post: {} }) as unknown as RadioTrack;

describe('CataloguePanel', () => {
  let catalogue: { search: ReturnType<typeof vi.fn>; tracks: ReturnType<typeof vi.fn> };
  let player: Record<string, unknown>;
  let actions: Record<string, unknown>;
  beforeEach(() => {
    catalogue = {
      search: vi.fn(async () => ({ items: [item('a'), item('b')], more: false })),
      tracks: vi.fn(async (found: CatalogueItem) => [track(found.id)]),
    };
    player = {
      installDock: vi.fn(),
      queue: signal([track('old')]),
      playNow: vi.fn(),
      replacePlaylist: vi.fn(),
    };
    actions = { published: signal([]), share: vi.fn(), addToPlaylist: vi.fn(), append: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CatalogueSearch, useValue: catalogue },
        { provide: RadioPlayer, useValue: player },
        { provide: TrackActions, useValue: actions },
        { provide: RadioPlaylists, useValue: { refresh: vi.fn(), active: signal('x') } },
      ],
    });
  });

  async function searched() {
    const fixture = TestBed.createComponent(CataloguePanel);
    fixture.componentRef.setInput('mode', 'share');
    fixture.detectChanges();
    const panel = fixture.componentInstance;
    panel.query.set('sea shanty');
    await panel.search();
    fixture.detectChanges();
    return { fixture, panel, root: fixture.nativeElement as HTMLElement };
  }

  it('searches the chosen catalogue and lists results with rights', async () => {
    const { root } = await searched();
    expect(catalogue.search).toHaveBeenCalledWith('loc', 'sea shanty', 1);
    expect(root.textContent).toContain('Select Song a');
    expect(root.textContent).toContain('No known restrictions');
    expect(player['installDock']).toHaveBeenCalled();
  });

  it('turns a selection into the playlist being built, after confirming a replacement', async () => {
    const { panel } = await searched();
    panel.toggle(item('a'), true);
    panel.toggle(item('b'), true);
    const confirm = vi.spyOn(TestBed.inject(AppDialogs), 'confirm').mockResolvedValue(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await panel.playlistSelected();
    expect(confirm).toHaveBeenCalledOnce();
    expect(player['replacePlaylist']).toHaveBeenCalledWith([track('a'), track('b')]);
    expect(TestBed.inject(RadioPlaylists).active()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/radio'], { queryParams: { view: 'publish' } });
  });

  it('shares and adds single items, resolving each item once', async () => {
    const { panel } = await searched();
    await panel.share(item('a'));
    expect(actions['share']).toHaveBeenCalledWith(track('a'));
    await panel.add(item('a'));
    expect(actions['addToPlaylist']).toHaveBeenCalledWith([track('a')]);
    expect(catalogue.tracks).toHaveBeenCalledOnce();
  });

  it('says so when an item has no playable recording', async () => {
    catalogue.tracks.mockResolvedValue([]);
    const { panel, fixture, root } = await searched();
    await panel.preview(item('a'));
    fixture.detectChanges();
    expect(root.textContent).toContain('No playable recording was found in “Song a”.');
    expect(player['playNow']).not.toHaveBeenCalled();
  });
});
