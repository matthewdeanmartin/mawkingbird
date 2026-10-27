import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { RadioPlayer } from './radio-player';
import { RadioSettings } from './radio-settings';

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
    TestBed.configureTestingModule({ providers: [{ provide: RadioPlayer, useValue: player }] });
    const fixture = TestBed.createComponent(RadioSettings);
    fixture.detectChanges();
    return { fixture, player, text: () => fixture.nativeElement.textContent as string };
  }

  it('lists allowed players by name and removes one', () => {
    const { fixture, player } = setUp(['soundcloud', 'mixcloud']);
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
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
    const checkbox = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.click();
    expect(player.setContinuous).toHaveBeenCalledWith(false);
  });
});
