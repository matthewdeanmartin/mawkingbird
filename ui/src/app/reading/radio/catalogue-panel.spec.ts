import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  let playlists: Record<string, unknown>;
  let actions: Record<string, unknown>;
  beforeEach(() => {
    catalogue = {
      search: vi.fn(async () => ({ items: [item('a'), item('b')], more: false })),
      tracks: vi.fn(async (found: CatalogueItem) => [track(found.id)]),
    };
    player = {
      installDock: vi.fn(),
      playSingle: vi.fn(),
    };
    playlists = { refresh: vi.fn(), active: signal('x'), create: vi.fn(() => 'new-id') };
    actions = {
      published: signal([]),
      share: vi.fn(),
      keep: vi.fn(() => 'Saved 1 single.'),
      append: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CatalogueSearch, useValue: catalogue },
        { provide: RadioPlayer, useValue: player },
        { provide: TrackActions, useValue: actions },
        { provide: RadioPlaylists, useValue: playlists },
      ],
    });
  });

  async function searched() {
    const fixture = TestBed.createComponent(CataloguePanel);
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

  it('turns a selection into a new saved playlist and opens it', async () => {
    const { panel } = await searched();
    panel.toggle(item('a'), true);
    panel.toggle(item('b'), true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await panel.playlistSelected();
    expect(playlists['create']).toHaveBeenCalledWith('Untitled playlist', [track('a'), track('b')]);
    expect(navigate).toHaveBeenCalledWith(['/playlists', 'new-id']);
  });

  it('saves selected items as Singles, or adds them to a target playlist', async () => {
    const { panel, fixture, root } = await searched();
    expect(root.textContent).toContain('Save single');
    panel.toggle(item('a'), true);
    await panel.addSelected();
    expect(actions['keep']).toHaveBeenCalledWith([track('a')], null);
    expect(panel.message()).toBe('Saved 1 single.');
    fixture.componentRef.setInput('target', 'mix');
    fixture.detectChanges();
    expect(root.textContent).toContain('Add to playlist');
    await panel.add(item('b'));
    expect(actions['keep']).toHaveBeenLastCalledWith([track('b')], 'mix');
  });

  it('shares and adds single items, resolving each item once', async () => {
    const { panel } = await searched();
    await panel.share(item('a'));
    expect(actions['share']).toHaveBeenCalledWith(track('a'));
    await panel.add(item('a'));
    expect(actions['keep']).toHaveBeenCalledWith([track('a')], null);
    expect(catalogue.tracks).toHaveBeenCalledOnce();
  });

  it('says so when an item has no playable recording', async () => {
    catalogue.tracks.mockResolvedValue([]);
    const { panel, fixture, root } = await searched();
    await panel.preview(item('a'));
    fixture.detectChanges();
    expect(root.textContent).toContain('No playable recording was found in “Song a”.');
    expect(player['playSingle']).not.toHaveBeenCalled();
  });
});
