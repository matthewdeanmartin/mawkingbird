import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { RadioPlayer } from './radio-player';
import { RadioSettings } from './radio-settings';
import { RadioSearches } from './radio-searches';
import { ProviderPreferences } from '../../audio-embeds/provider-preferences';

function checkbox(root: HTMLElement, label: string): HTMLInputElement {
  const match = Array.from(root.querySelectorAll('label')).find(
    (item) => item.textContent?.trim() === label,
  )!;
  return (match.querySelector('input') ??
    root.querySelector(`#${match.getAttribute('for')}`)) as HTMLInputElement;
}

describe('RadioSettings', () => {
  function setUp(allowed: string[]) {
    const player = {
      externalAllowed: signal(new Set(allowed)),
      forgetProvider: vi.fn(),
      continuous: signal(true),
      setContinuous: vi.fn(),
      volume: signal(0.5),
      setVolume: vi.fn(),
    };
    const prefs = {
      prefs: signal({ subscribed: ['apple-music'], hidden: [] as string[], showAll: false }),
      setSubscribed: vi.fn(),
      setHidden: vi.fn(),
      setShowAll: vi.fn(),
    };
    const searches = {
      saved: signal([
        { id: 's', name: '#robotmusic', source: 'tag', value: 'robotmusic', nativeOnly: false },
      ]),
      refresh: vi.fn(),
      remove: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: RadioPlayer, useValue: player },
        { provide: ProviderPreferences, useValue: prefs },
        { provide: RadioSearches, useValue: searches },
      ],
    });
    const fixture = TestBed.createComponent(RadioSettings);
    fixture.detectChanges();
    return {
      fixture,
      player,
      prefs,
      searches,
      text: () => fixture.nativeElement.textContent as string,
    };
  }

  it('lists allowed players by name and removes one', () => {
    const { fixture, player } = setUp(['soundcloud', 'mixcloud']);
    const buttons = Array.from(
      fixture.nativeElement.querySelector('mb-settings-row').querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Remove Mixcloud',
      'Remove SoundCloud',
    ]);
    buttons[1].click();
    expect(player.forgetProvider).toHaveBeenCalledWith('soundcloud');
  });

  it('explains when no player is allowed and changes playback preferences', () => {
    const { fixture, player, text } = setUp([]);
    expect(text()).toContain('No services are allowed yet.');
    expect(text()).toContain('50%');
    checkbox(fixture.nativeElement, 'Play the next track automatically').click();
    expect(player.setContinuous).toHaveBeenCalledWith(false);
  });

  it('records subscriptions and hidden services, and removes saved searches', () => {
    const { fixture, prefs, searches, text } = setUp([]);
    const root = fixture.nativeElement as HTMLElement;
    expect(checkbox(root, 'I subscribe to Apple Music').checked).toBe(true);
    // Free services have nothing to subscribe to.
    expect(text()).not.toContain('I subscribe to Bandcamp');
    checkbox(root, 'Hide Spotify players').click();
    expect(prefs.setHidden).toHaveBeenCalledWith('spotify', true);
    checkbox(root, 'I subscribe to TIDAL').click();
    expect(prefs.setSubscribed).toHaveBeenCalledWith('tidal', true);
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Remove #robotmusic')!
      .click();
    expect(searches.remove).toHaveBeenCalledWith('s');
  });
});
