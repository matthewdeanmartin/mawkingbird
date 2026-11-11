import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Playback, PlaybackHandle } from '../video-player/playback';
import { externalMedia } from './providers';
import { ExternalPlayer } from './external-player';

describe('ExternalPlayer activation', () => {
  let handles: PlaybackHandle[];
  beforeEach(() => {
    handles = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Playback,
          useValue: {
            stopAll: vi.fn(),
            started: vi.fn(),
            register: (handle: PlaybackHandle) => {
              handles.push(handle);
              return () => handle.pause();
            },
          },
        },
      ],
    });
  });
  it('creates no iframe or script until the provider-specific load action', async () => {
    const fixture = TestBed.createComponent(ExternalPlayer);
    fixture.componentRef.setInput('source', externalMedia('https://open.spotify.com/track/abc'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Load Spotify player');
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('iframe').src).toBe(
      'https://open.spotify.com/embed/track/abc',
    );
    expect(document.querySelector('script[src*="spotify"]')).toBeNull();
    handles[0].pause();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    fixture.destroy();
  });
  it('keeps a manually activated managed player open when its source is refreshed', async () => {
    const fixture = TestBed.createComponent(ExternalPlayer);
    fixture.componentRef.setInput('source', externalMedia('https://soundcloud.com/artist/track'));
    fixture.componentRef.setInput('managed', true);
    fixture.componentRef.setInput('activate', false);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeTruthy();
    fixture.componentRef.setInput('source', externalMedia('https://soundcloud.com/artist/track'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeTruthy();
    fixture.destroy();
  });

  it('attaches managed controls only after the expected frame reports ready', async () => {
    const fixture = TestBed.createComponent(ExternalPlayer);
    fixture.componentRef.setInput('source', externalMedia('https://soundcloud.com/artist/track'));
    fixture.componentRef.setInput('managed', true);
    fixture.componentRef.setInput('activate', true);
    const ready = vi.fn();
    fixture.componentInstance.ready.subscribe(ready);
    fixture.detectChanges();
    TestBed.tick();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    expect(ready).not.toHaveBeenCalled();
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'https://w.soundcloud.com',
        data: JSON.stringify({ method: 'ready' }),
      }),
    );
    await fixture.whenStable();
    expect(ready).toHaveBeenCalledOnce();
    expect(handles).toHaveLength(0);
    const controller = ready.mock.calls[0][0];
    const destroy = vi.spyOn(controller, 'destroy');
    const safeSource = fixture.componentInstance.safeSource();
    fixture.componentRef.setInput('source', externalMedia('https://soundcloud.com/artist/track'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(destroy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.safeSource()).toBe(safeSource);
    expect(fixture.nativeElement.querySelector('iframe')).toBe(frame);
    fixture.componentInstance.close();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    fixture.destroy();
  });
  it('starts an allowed feed player as soon as it is ready, without the press-Play notice', async () => {
    const fixture = TestBed.createComponent(ExternalPlayer);
    fixture.componentRef.setInput('source', externalMedia('https://soundcloud.com/artist/track'));
    fixture.componentRef.setInput('activate', true);
    fixture.componentRef.setInput('autoplay', true);
    fixture.detectChanges();
    TestBed.tick();
    expect(fixture.nativeElement.textContent).not.toContain('Press Play in the player');
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    const send = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'https://w.soundcloud.com',
        data: JSON.stringify({ method: 'ready' }),
      }),
    );
    await fixture.whenStable();
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ method: 'play', value: null }),
      'https://w.soundcloud.com',
    );
    fixture.destroy();
  });
  it('closes an opaque external frame when native audio starts elsewhere', async () => {
    const fixture = TestBed.createComponent(ExternalPlayer);
    fixture.componentRef.setInput('source', externalMedia('https://open.spotify.com/track/abc'));
    fixture.componentRef.setInput('activate', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const audio = document.createElement('audio');
    document.body.append(audio);
    audio.dispatchEvent(new Event('play'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    audio.remove();
    fixture.destroy();
  });
});
