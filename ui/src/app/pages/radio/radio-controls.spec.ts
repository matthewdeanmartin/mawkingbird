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
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: RadioPlayer, useValue: player }],
    });
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
