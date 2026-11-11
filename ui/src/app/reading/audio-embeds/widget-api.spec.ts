import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectWidget } from './widget-api';

describe('external widget adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('iframe[data-test-widget]').forEach((f) => f.remove());
  });
  function frame(): HTMLIFrameElement {
    const f = document.createElement('iframe');
    f.dataset['testWidget'] = 'true';
    document.body.append(f);
    return f;
  }
  function message(frame: HTMLIFrameElement, data: unknown, origin = 'https://w.soundcloud.com') {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        origin,
        data: JSON.stringify(data),
      }),
    );
  }
  it('waits for SoundCloud readiness, translates milliseconds, and removes listeners', async () => {
    const f = frame();
    const send = vi.spyOn(f.contentWindow!, 'postMessage');
    const update = vi.fn();
    const connecting = connectWidget('soundcloud', f, update);
    expect(send).not.toHaveBeenCalled();
    message(f, { method: 'ready' });
    const controller = await connecting;
    controller.play();
    controller.seek(12);
    controller.volume(0.4);
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ method: 'seekTo', value: 12000 }),
      'https://w.soundcloud.com',
    );
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ method: 'setVolume', value: 40 }),
      'https://w.soundcloud.com',
    );
    message(f, { method: 'getDuration', value: 90000 });
    message(f, { method: 'playProgress', value: { currentPosition: 12500 } });
    message(f, { method: 'finish' });
    expect(update).toHaveBeenCalledWith({ duration: 90 });
    expect(update).toHaveBeenCalledWith({ time: 12.5 });
    expect(update).toHaveBeenCalledWith({ playing: false, ended: true });
    controller.destroy();
    update.mockClear();
    message(f, { method: 'play' });
    expect(update).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ method: 'removeEventListener', value: 'finish' }),
      'https://w.soundcloud.com',
    );
  });
  it('asks SoundCloud for the current sound and reports a bounded title and artist', async () => {
    const f = frame();
    const send = vi.spyOn(f.contentWindow!, 'postMessage');
    const update = vi.fn();
    const connecting = connectWidget('soundcloud', f, update);
    message(f, { method: 'ready' });
    await connecting;
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ method: 'getCurrentSound', value: null }),
      'https://w.soundcloud.com',
    );
    message(f, { method: 'getCurrentSound', value: { title: ' Night Drive ', user: {} } });
    expect(update).toHaveBeenLastCalledWith({ title: 'Night Drive' });
    message(f, {
      method: 'getCurrentSound',
      value: { title: 'x'.repeat(300), user: { username: 'synth' } },
    });
    expect(update).toHaveBeenLastCalledWith({ title: 'x'.repeat(200), artist: 'synth' });
    update.mockClear();
    message(f, { method: 'getCurrentSound', value: { title: 7 } });
    message(f, { method: 'getCurrentSound', value: null });
    expect(update).not.toHaveBeenCalled();
  });
  it('translates Mixcloud events and handles rejected playback without an unhandled promise', async () => {
    const f = frame();
    const send = vi.spyOn(f.contentWindow!, 'postMessage');
    const update = vi.fn();
    const connecting = connectWidget('mixcloud', f, update);
    const origin = 'https://player-widget.mixcloud.com';
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'getApi' }), origin);
    message(
      f,
      { mixcloud: 'playerWidget', type: 'api', data: { methods: ['play', 'pause', 'seek'] } },
      origin,
    );
    const controller = await connecting;
    message(
      f,
      { mixcloud: 'playerWidget', type: 'event', data: { eventName: 'progress', args: [5, 100] } },
      origin,
    );
    expect(update).toHaveBeenCalledWith({ time: 5, duration: 100 });
    controller.play();
    message(
      f,
      { mixcloud: 'playerWidget', type: 'methodResponse', data: { methodId: 1, value: false } },
      origin,
    );
    expect(update).toHaveBeenCalledWith({ error: true });
    controller.destroy();
    update.mockClear();
    message(f, { mixcloud: 'playerWidget', type: 'event', data: { eventName: 'ended' } }, origin);
    expect(update).not.toHaveBeenCalled();
  });
  it('refuses unrecognized controller providers without loading a script', async () => {
    await expect(connectWidget('spotify', frame(), vi.fn())).rejects.toThrow(
      'Unsupported controller',
    );
    expect(document.querySelector('script[src*="spotify"]')).toBeNull();
  });
  it('rejects messages from another origin or another player window', async () => {
    const f = frame();
    const other = frame();
    const update = vi.fn();
    const connecting = connectWidget('soundcloud', f, update);
    message(f, { method: 'ready' });
    const controller = await connecting;
    message(f, { method: 'play' }, 'https://evil.test');
    message(other, { method: 'finish' });
    expect(update).not.toHaveBeenCalled();
    controller.destroy();
  });
});
