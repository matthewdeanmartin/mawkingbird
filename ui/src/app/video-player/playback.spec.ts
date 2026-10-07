import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { Server } from '../server';
import { Playback, PlaybackHandle } from './playback';

describe('User-controlled playback coordination', () => {
  const account = signal({ id: 'a' });
  let playback: Playback;
  const handle = (): PlaybackHandle => ({
    pause: vi.fn(),
    position: () => ({
      time: 42,
      volume: 0.4,
      muted: true,
      rate: 1.5,
    }),
  });

  beforeEach(() => {
    account.set({ id: 'a' });
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { account, kind: signal('mastodon'), token: signal('token') } },
        { provide: Server, useValue: { baseUrl: signal('https://home.test') } },
      ],
    });
    playback = TestBed.inject(Playback);
    TestBed.tick();
  });

  it('registering never plays; a user-started player pauses the others', () => {
    const first = handle();
    const second = handle();
    playback.register(first);
    playback.register(second);
    expect(first.pause).not.toHaveBeenCalled();
    playback.started(second);
    expect(first.pause).toHaveBeenCalledOnce();
    expect(second.pause).not.toHaveBeenCalled();
  });

  it('handoff records controls once and pauses the source without retaining play intent', () => {
    const player = handle();
    playback.handoff('clip', player);
    expect(player.pause).toHaveBeenCalledOnce();
    expect(playback.take('clip')).toEqual({ time: 42, volume: 0.4, muted: true, rate: 1.5 });
    expect(playback.take('clip')).toBeUndefined();
  });

  it('account switches stop players and discard previous account positions', () => {
    const player = handle();
    playback.register(player);
    playback.handoff('clip', player);
    vi.mocked(player.pause).mockClear();
    account.set({ id: 'b' });
    TestBed.tick();
    expect(player.pause).toHaveBeenCalledOnce();
    expect(playback.take('clip')).toBeUndefined();
  });

  it('unregistering stops the player and removes it from coordination', () => {
    const player = handle();
    const unregister = playback.register(player);
    unregister();
    vi.mocked(player.pause).mockClear();
    playback.stopAll();
    expect(player.pause).not.toHaveBeenCalled();
  });
});
