import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { SettingsHomeAlgo } from './settings-home-algo';
import { HomeAlgoSettings, HOME_FACTORY, ALGO_FACTORY } from '../../../home-algo-settings';
import { HomeDefaults } from '../../../home-defaults';
import { HomeFeedCatalog } from '../../../home-feed-catalog';

describe('Home and Algo Settings page', () => {
  const save = vi.fn(() => true);
  const set = vi.fn();
  beforeEach(() => {
    save.mockClear();
    set.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: HomeAlgoSettings, useValue: { value: signal(HOME_FACTORY), save } },
        { provide: HomeDefaults, useValue: { value: signal('media'), set } },
        {
          provide: HomeFeedCatalog,
          useValue: { choices: async () => [{ type: 'tags', id: 'cats', label: '#cats' }] },
        },
      ],
    });
  });
  it('uses the shared Settings layout and saves the chosen source and presentation together', async () => {
    const fixture = TestBed.createComponent(SettingsHomeAlgo);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.spage-head h1')?.textContent).toContain('Home and Algo');
    expect(root.querySelectorAll('.spage-body > .ssection')).toHaveLength(2);
    const mode = root.querySelector<HTMLSelectElement>('[name="mode"]')!;
    mode.value = 'favorite';
    mode.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    const feed = root.querySelector<HTMLSelectElement>('[name="favorite"]')!;
    feed.value = 'cats';
    feed.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'favorite',
        favorite: { type: 'tags', id: 'cats', label: '#cats' },
      }),
    );
    expect(set).toHaveBeenCalledWith('media');
  });
  it('factory reset is staged until Save and leaves the Home choices intact', async () => {
    const fixture = TestBed.createComponent(SettingsHomeAlgo);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const reset = [...root.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('factory defaults'),
    )!;
    reset.click();
    expect(save).not.toHaveBeenCalled();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'friends', algo: ALGO_FACTORY }),
    );
  });
  it('reports a failed presentation write without claiming the form was saved', async () => {
    set.mockReturnValueOnce(false);
    const fixture = TestBed.createComponent(SettingsHomeAlgo);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('.sactions [role="alert"]')?.textContent).toContain(
      'Could not save all settings',
    );
    expect(root.querySelector('.sactions [role="status"]')).toBeNull();
  });
});
