import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { Server } from '../server';
import { VideoPlayer } from './video-player';
import { Playback } from './playback';
import { VideoSource, youtubeSource } from './media-source';

describe('VideoPlayer user control', () => {
  let fixture: ComponentFixture<VideoPlayer>;
  const source: VideoSource = {
    kind: 'native',
    key: 'clip',
    url: 'https://media.test/clip.mp4',
    title: 'A clip',
  };
  let play: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    TestBed.configureTestingModule({
      imports: [VideoPlayer],
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            kind: signal('mastodon'),
            account: signal({ id: 'a' }),
            token: signal('token'),
          },
        },
        { provide: Server, useValue: { baseUrl: signal('https://home.test') } },
      ],
    });
  });
  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mount(video: VideoSource = source): HTMLVideoElement {
    fixture = TestBed.createComponent(VideoPlayer);
    fixture.componentRef.setInput('source', video);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('video');
  }

  it('opening, metadata readiness and ending never play, loop or advance a video', () => {
    const video = mount();
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('ended'));
    expect(video.controls).toBe(true);
    expect(video.preload).toBe('none');
    expect(video.autoplay).toBe(false);
    expect(video.loop).toBe(false);
    expect(fixture.nativeElement.querySelector('select').value).toBe('1');
    expect(play).not.toHaveBeenCalled();
    expect(video.src).toBe(source.url);
  });

  it('restores a handed-off position and controls while remaining paused', () => {
    TestBed.inject(Playback);
    TestBed.tick();
    TestBed.inject(Playback).handoff('clip', {
      pause: vi.fn(),
      position: () => ({
        time: 80,
        volume: 0.3,
        muted: true,
        rate: 1.5,
      }),
    });
    const video = mount();
    Object.defineProperty(video, 'duration', { value: 60 });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(60);
    expect(video.volume).toBe(0.3);
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(1.5);
    fixture.detectChanges();
    expect(video.preload).toBe('metadata');
    expect(fixture.nativeElement.querySelector('select').value).toBe('1.5');
    expect(play).not.toHaveBeenCalled();
  });

  it('scopes shortcuts to the wrapper and leaves native controls and form keys alone', () => {
    const video = mount();
    const wrapper = fixture.nativeElement.querySelector('section');
    video.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
    expect(play).not.toHaveBeenCalled();
    wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
    expect(play).toHaveBeenCalledOnce();
    const select = fixture.nativeElement.querySelector('select');
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
    expect(play).toHaveBeenCalledOnce();
  });

  it('a keyboard play rejection produces a recoverable error', async () => {
    mount();
    play.mockRejectedValue(new Error('denied'));
    fixture.nativeElement
      .querySelector('section')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      "Couldn't play",
    );
    expect(fixture.nativeElement.querySelector('a[target=_blank]').href).toBe(source.url);
  });

  it('source changes replace the native element and keep the next clip paused', () => {
    const first = mount();
    fixture.componentRef.setInput('source', {
      ...source,
      key: 'next',
      url: 'https://media.test/next.mp4',
    });
    fixture.detectChanges();
    const next = fixture.nativeElement.querySelector('video');
    expect(next).not.toBe(first);
    expect(next.src).toBe('https://media.test/next.mp4');
    expect(play).not.toHaveBeenCalled();
  });

  it('pauses a feed player leaving the viewport without playing on return', () => {
    let observerCallback!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observerCallback = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    fixture = TestBed.createComponent(VideoPlayer);
    fixture.componentRef.setInput('source', source);
    fixture.componentRef.setInput('inline', true);
    fixture.detectChanges();
    const video = fixture.nativeElement.querySelector('video');
    Object.defineProperty(video, 'paused', { value: false });
    observerCallback(
      [{ isIntersecting: false }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    expect(video.pause).toHaveBeenCalled();
    observerCallback(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    expect(play).not.toHaveBeenCalled();
    fixture.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('does not load an iframe or SDK before explicit external-player activation', () => {
    mount(youtubeSource('https://youtu.be/dQw4w9WgXcQ')!);
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeNull();
  });

  it('starting another player closes YouTube and requires explicit reactivation', () => {
    mount(youtubeSource('https://youtu.be/dQw4w9WgXcQ')!);
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('iframe');
    TestBed.inject(Playback).started({
      pause: vi.fn(),
      position: () => ({ time: 0, volume: 1, muted: false, rate: 1 }),
    });
    fixture.detectChanges();
    expect(frame.hasAttribute('src')).toBe(false);
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('Load YouTube');
    expect(play).not.toHaveBeenCalled();
  });

  it('loads a single YouTube video with no autoplay, loop or playlist, and never plays on readiness', async () => {
    mount(youtubeSource('https://youtu.be/dQw4w9WgXcQ?t=12&autoplay=1&list=evil')!);
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('iframe');
    const url = new URL(frame.src);
    expect(url.hostname).toBe('www.youtube-nocookie.com');
    expect(url.searchParams.get('autoplay')).toBe('0');
    expect(url.searchParams.get('loop')).toBe('0');
    expect(url.searchParams.get('start')).toBe('12');
    expect(url.searchParams.has('list')).toBe(false);
    expect(frame.referrerPolicy || frame.getAttribute('referrerpolicy')).toBe(
      'strict-origin-when-cross-origin',
    );
    frame.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    fixture.componentRef.setInput('source', {
      ...youtubeSource('https://youtu.be/dQw4w9WgXcQ?t=12')!,
      title: 'Updated title',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBe(frame);
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("doesn't transfer between views");
    expect(play).not.toHaveBeenCalled();
    fixture.destroy();
    expect(frame.hasAttribute('src')).toBe(false);
  });
});
