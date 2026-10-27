import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingZen } from '../../reading-zen';
import { RadioControls } from './radio-controls';
import { RadioPlayer } from './radio-player';

describe('RadioControls', () => {
  const track = {
    key: 'one',
    post: { id: 'one', content: '<p>Music</p>', account: { acct: 'music' } },
    media: {},
  };
  let player: Record<string, unknown>;
  beforeEach(() => {
    player = {
      current: signal(track),
      queue: signal([track]),
      selected: signal(0),
      hidden: signal(false),
      playing: signal(false),
      waiting: signal(false),
      time: signal(0),
      duration: signal(60),
      volume: signal(1),
      blocked: signal(false),
      skipped: signal(0),
      toggle: vi.fn(),
      previous: vi.fn(),
      next: vi.fn(),
      select: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      stop: vi.fn(),
      externalReady: signal(true),
      externalAllowed: signal(new Set(['soundcloud'])),
      title: () => 'Music',
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: RadioPlayer, useValue: player }],
    });
  });
  it('renders Stop and provider actions in the full-player toolbar with Close immediately after Stop', () => {
    player['current'] = signal({
      ...track,
      external: { provider: 'soundcloud', label: 'SoundCloud' },
    });
    const external = { activated: signal(true), close: vi.fn(), openOriginal: vi.fn() };
    const fixture = TestBed.createComponent(RadioControls);
    fixture.componentRef.setInput('externalPlayer', external);
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelector('mb-toolbar').querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const name = (button: HTMLButtonElement) => button.getAttribute('aria-label');
    const stop = buttons.findIndex((button) => name(button) === 'Stop Radio');
    expect(stop).toBeGreaterThan(-1);
    expect(name(buttons[stop + 1])).toBe('Close player');
    expect(buttons[stop + 1].textContent?.trim()).toBe('');
    buttons[stop + 1].click();
    expect(external.close).toHaveBeenCalledOnce();
    buttons.find((button) => name(button) === 'Open on SoundCloud')!.click();
    expect(external.openOriginal).toHaveBeenCalledOnce();
    buttons[stop].click();
    expect(player['stop']).toHaveBeenCalledOnce();
  });
  it('covers unusable controls with one consent or load step until the provider player is ready', () => {
    player['current'] = signal({
      ...track,
      external: { provider: 'mixcloud', label: 'Mixcloud', url: 'https://mixcloud.com/a/b/' },
    });
    player['externalReady'] = signal(false);
    player['externalAllowed'] = signal(new Set<string>());
    player['allowProvider'] = vi.fn();
    const external = { activated: signal(false), close: vi.fn(), openOriginal: vi.fn() };
    const fixture = TestBed.createComponent(RadioControls);
    fixture.componentRef.setInput('externalPlayer', external);
    fixture.detectChanges();
    const overlay = () => fixture.nativeElement.querySelector('.overlay') as HTMLElement | null;
    const button = (text: string) =>
      Array.from(overlay()!.querySelectorAll('button')).find(
        (item) => item.textContent?.trim() === text,
      ) as HTMLButtonElement;
    expect(fixture.nativeElement.querySelector('.stage').inert).toBe(true);
    button('Allow Mixcloud in Radio').click();
    expect(player['allowProvider']).toHaveBeenCalledWith('mixcloud');
    (player['externalAllowed'] as ReturnType<typeof signal<Set<string>>>).set(
      new Set(['mixcloud']),
    );
    fixture.detectChanges();
    button('Load Mixcloud player').click();
    expect(external.activated()).toBe(true);
    fixture.detectChanges();
    expect(overlay()!.textContent).toContain('Loading the Mixcloud player');
    (player['externalReady'] as ReturnType<typeof signal<boolean>>).set(true);
    fixture.detectChanges();
    expect(overlay()).toBeNull();
    expect(fixture.nativeElement.querySelector('.stage').inert).toBe(false);
  });
  it('scopes shortcuts to the player and leaves native range keys alone', () => {
    const fixture = TestBed.createComponent(RadioControls);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    host
      .querySelector('section')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(player['toggle']).toHaveBeenCalledOnce();
    const range = host.querySelector('input')!;
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(player['next']).not.toHaveBeenCalled();
    range.value = '15';
    range.dispatchEvent(new Event('input'));
    expect(player['seek']).toHaveBeenCalledWith(15);
  });
  it('releases fullscreen Zen when navigating away without stopping playback', async () => {
    const fixture = TestBed.createComponent(RadioControls);
    fixture.detectChanges();
    fixture.nativeElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('not supported'));
    await fixture.componentInstance.toggleFullscreen();
    expect(fixture.componentInstance.fullscreen()).toBe(true);
    expect(TestBed.inject(ReadingZen).chromeHidden()).toBe(true);
    fixture.destroy();
    expect(TestBed.inject(ReadingZen).chromeHidden()).toBe(false);
    expect(player['toggle']).not.toHaveBeenCalled();
  });
});
