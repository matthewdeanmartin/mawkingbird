import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatSound } from './chat-sound';
import { Relationship, Status } from '../../platform/api/models';

describe('ChatSound', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sounds only for fresh mutual messages, deduplicates and rate limits bursts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    const start = vi.fn();
    const parameter = {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 0;
        destination = {};
        resume = () => Promise.resolve();
        close = () => Promise.resolve();
        createOscillator = () => ({
          frequency: parameter,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start,
          stop: vi.fn(),
        });
        createGain = () => ({ gain: parameter, connect: vi.fn(), disconnect: vi.fn() });
      },
    );
    const sound = new ChatSound();
    sound.toggle();
    await Promise.resolve();
    const relationship = { following: true, followed_by: true } as Relationship;
    const message = (id: string, created_at = new Date().toISOString()) =>
      ({ id, created_at, account: { id: 'friend' } }) as Status;
    sound.receive(message('old', '2020-01-01'), relationship, 'me', false);
    sound.receive(message('stranger'), undefined, 'me', false);
    sound.receive(message('one-way'), { ...relationship, followed_by: false }, 'me', false);
    sound.receive(message('muted'), { ...relationship, muting: true }, 'me', false);
    sound.receive(message('blocked'), { ...relationship, blocking: true }, 'me', false);
    sound.receive(message('mine'), relationship, 'friend', false);
    sound.receive(message('local-mute'), relationship, 'me', true);
    expect(start).not.toHaveBeenCalled();
    sound.receive(message('first'), relationship, 'me', false);
    sound.receive(message('burst'), relationship, 'me', false);
    expect(start).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    sound.receive(message('first'), relationship, 'me', false);
    expect(start).toHaveBeenCalledTimes(1);
    sound.receive(message('next'), relationship, 'me', false);
    expect(start).toHaveBeenCalledTimes(2);
    sound.toggle();
    vi.advanceTimersByTime(10_000);
    sound.receive(message('off'), relationship, 'me', false);
    expect(start).toHaveBeenCalledTimes(2);
    sound.ngOnDestroy();
  });

  it('stays silent when browser audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    const sound = new ChatSound();
    sound.toggle();
    expect(sound.enabled()).toBe(false);
  });
});
