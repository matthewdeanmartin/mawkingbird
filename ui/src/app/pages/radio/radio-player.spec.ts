import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { TrustedAccounts } from '../../trusted-accounts';
import { FollowTrust } from '../../follow-trust';
import { Playback } from '../../video-player/playback';
import { Status } from '../../models';
import { MediaFeedPage } from '../../media-feed-scan';
import { RADIO_AUDIO, RadioPlayer } from './radio-player';

function post(id: string, hidden = false): Status {
  return {
    id,
    account: { acct: 'music' },
    spoiler_text: hidden ? 'Warning' : '',
    sensitive: hidden,
    media_attachments: [
      { id: `${id}-audio`, type: 'audio', url: `https://audio.example/${id}.mp3` },
    ],
  } as Status;
}

describe('RadioPlayer', () => {
  let player: RadioPlayer;
  let audios: HTMLAudioElement[];
  let reportPlaying: boolean;
  let token: ReturnType<typeof signal<string>>;
  beforeEach(() => {
    audios = [];
    reportPlaying = true;
    token = signal('first');
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { kind: signal('mastodon'), token } },
        { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        {
          provide: RADIO_AUDIO,
          useValue: () => {
            const audio = document.createElement('audio');
            Object.defineProperty(audio, 'duration', { value: 90 });
            vi.spyOn(audio, 'play').mockImplementation(async () => {
              if (reportPlaying) audio.dispatchEvent(new Event('playing'));
            });
            vi.spyOn(audio, 'pause').mockImplementation(() => {
              audio.dispatchEvent(new Event('pause'));
            });
            vi.spyOn(audio, 'load').mockImplementation(() => undefined);
            audios.push(audio);
            return audio;
          },
        },
      ],
    });
    player = TestBed.inject(RadioPlayer);
    TestBed.tick();
  });

  function externalPost(id: string, provider = 'soundcloud'): Status {
    return {
      ...post(id),
      media_attachments: [],
      content: `<a href="https://${provider}.com/artist/track-${id}">Listen</a>`,
    };
  }
  function controller() {
    return { play: vi.fn(), pause: vi.fn(), seek: vi.fn(), volume: vi.fn(), destroy: vi.fn() };
  }

  it('queues one controllable alternative per post and never treats YouTube as radio audio', () => {
    const first = externalPost('1');
    first.content += '<a href="https://mixcloud.com/artist/mix/">Alternative</a>';
    player.scan.posts.set([
      first,
      {
        ...post('2'),
        media_attachments: [],
        content: '<a href="https://www.youtube.com/watch?v=abcdefghijk">Music</a>',
      },
    ]);
    expect(player.queue()).toHaveLength(1);
    expect(player.queue()[0].external?.provider).toBe('soundcloud');
    player.chooseExternal(first, player.radioSources(first)[1]);
    expect(player.queue()).toHaveLength(1);
    expect(player.current()?.external?.provider).toBe('mixcloud');
    expect(audios).toHaveLength(0);
  });

  it('requires activation, advances through an authorized provider, and ignores stale widget events', () => {
    player.scan.posts.set([externalPost('1'), externalPost('2'), externalPost('3', 'mixcloud')]);
    player.scan.exhausted.set(true);
    player.select(0);
    expect(player.externalAllowed().size).toBe(0);
    const firstKey = player.current()!.key;
    const first = controller();
    player.attachWidget(firstKey, first);
    expect(first.play).not.toHaveBeenCalled();
    player.play();
    expect(first.play).toHaveBeenCalledOnce();
    player.widgetState(firstKey, { playing: true, duration: 90, time: 10 });
    player.seek(20);
    expect(first.seek).toHaveBeenCalledWith(20);
    player.widgetState(firstKey, { ended: true });
    expect(player.current()?.post.id).toBe('2');
    const secondKey = player.current()!.key;
    const second = controller();
    player.attachWidget(secondKey, second);
    expect(second.play).toHaveBeenCalledOnce();
    player.widgetState(firstKey, { ended: true, time: 80 });
    expect(player.current()?.post.id).toBe('2');
    expect(player.time()).toBe(0);
    player.widgetState(secondKey, { ended: true });
    expect(player.current()?.post.id).toBe('3');
    const third = controller();
    player.attachWidget(player.current()!.key, third);
    expect(third.play).not.toHaveBeenCalled();
  });

  it('does not advance after pausing an external player or load content behind a warning', () => {
    player.scan.posts.set([externalPost('1'), externalPost('2')]);
    player.select(0);
    const key = player.current()!.key;
    const widget = controller();
    player.attachWidget(key, widget);
    player.play();
    player.pause();
    player.widgetState(key, { ended: true });
    expect(player.selected()).toBe(0);
    const hidden = { ...externalPost('3'), spoiler_text: 'Warning' };
    player.scan.posts.set([hidden]);
    player.select(0);
    const stale = controller();
    player.attachWidget(player.current()!.key, stale);
    expect(stale.destroy).toHaveBeenCalledOnce();
    expect(player.externalReady()).toBe(false);
  });

  it('plays each attachment in feed order, advances on ended, and never loops', async () => {
    const first = post('1');
    first.media_attachments.push({
      ...first.media_attachments[0],
      id: 'second',
      url: 'https://audio.example/second.mp3',
    });
    player.scan.posts.set([first, post('2')]);
    player.scan.exhausted.set(true);
    player.select(0);
    expect(player.playing()).toBe(true);
    audios[0].dispatchEvent(new Event('ended'));
    expect(player.current()?.media.id).toBe('second');
    expect(audios[0].getAttribute('src')).toBeNull();
    audios[1].dispatchEvent(new Event('ended'));
    expect(player.current()?.post.id).toBe('2');
    audios[2].dispatchEvent(new Event('ended'));
    await Promise.resolve();
    expect(player.selected()).toBe(2);
    expect(player.playing()).toBe(false);
    expect(audios).toHaveLength(3);
  });

  it('does not load hidden audio until reveal and pauses again at the next warning', () => {
    player.scan.posts.set([post('1', true), post('2', true)]);
    player.select(0);
    expect(audios).toHaveLength(0);
    player.reveal();
    expect(audios).toHaveLength(1);
    expect(player.playing()).toBe(true);
    audios[0].dispatchEvent(new Event('ended'));
    expect(player.hidden()).toBe(true);
    expect(player.playing()).toBe(false);
    expect(audios).toHaveLength(1);
  });

  it('seeks and changes volume without recreating the audio element', () => {
    player.scan.posts.set([post('1')]);
    player.select(0);
    audios[0].dispatchEvent(new Event('loadedmetadata'));
    player.seek(25);
    player.setVolume(0.4);
    player.pause();
    player.play();
    expect(audios).toHaveLength(1);
    expect(audios[0].currentTime).toBe(25);
    expect(audios[0].volume).toBe(0.4);
    expect(player.duration()).toBe(90);
  });

  it('skips unavailable tracks and ignores late events from a replaced track', () => {
    player.scan.posts.set([post('1'), post('2'), post('3')]);
    player.select(0);
    audios[0].dispatchEvent(new Event('error'));
    expect(player.current()?.post.id).toBe('2');
    expect(player.skipped()).toBe(1);
    audios[0].dispatchEvent(new Event('ended'));
    expect(player.current()?.post.id).toBe('2');
  });

  it('prefetches once near the end and does not resume after Pause during a fetch', async () => {
    const nextPage = new Subject<MediaFeedPage>();
    const fetch = vi.fn((cursor?: string) =>
      cursor
        ? nextPage
        : of({ statuses: Array.from({ length: 20 }, (_, i) => post(String(i))), next: 'next' }),
    );
    await player.scan.start(fetch);
    player.select(19);
    expect(fetch).toHaveBeenCalledTimes(2);
    audios[0].dispatchEvent(new Event('ended'));
    player.pause();
    nextPage.next({ statuses: [post('20')], next: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.current()?.post.id).toBe('19');
    expect(player.playing()).toBe(false);
    expect(player.queue()).toHaveLength(21);
  });

  it('stops and clears private queue data on account change', () => {
    player.scan.posts.set([post('1')]);
    player.select(0);
    token.set('second');
    TestBed.tick();
    expect(player.active()).toBe(false);
    expect(player.queue()).toEqual([]);
    expect(document.querySelector('audio[data-radio]')).toBeNull();
  });

  it('pauses when another media element starts', () => {
    player.scan.posts.set([post('1')]);
    player.select(0);
    const video = document.createElement('video');
    document.body.append(video);
    video.dispatchEvent(new Event('play'));
    expect(player.playing()).toBe(false);
    video.remove();
  });

  it('never resumes from late ended or error events after an explicit pause', () => {
    player.scan.posts.set([post('1'), post('2')]);
    player.select(0);
    player.pause();
    audios[0].dispatchEvent(new Event('ended'));
    audios[0].dispatchEvent(new Event('error'));
    expect(player.current()?.post.id).toBe('1');
    expect(player.playing()).toBe(false);
    expect(audios).toHaveLength(1);
  });

  it('bounds consecutive failures and does not restart from late playing events after Pause', () => {
    reportPlaying = false;
    player.scan.posts.set([post('1'), post('2'), post('3'), post('4')]);
    player.select(0);
    audios[0].dispatchEvent(new Event('error'));
    audios[1].dispatchEvent(new Event('error'));
    audios[2].dispatchEvent(new Event('error'));
    expect(player.blocked()).toBe(true);
    expect(audios).toHaveLength(3);
    audios[2].dispatchEvent(new Event('playing'));
    expect(player.playing()).toBe(false);
  });

  it('keeps a browser-rejected track available for explicit retry', async () => {
    player.scan.posts.set([post('1')]);
    player.select(0);
    player.pause();
    vi.mocked(audios[0].play).mockRejectedValueOnce(
      new DOMException('User gesture required', 'NotAllowedError'),
    );
    player.play();
    await Promise.resolve();
    expect(player.blocked()).toBe(true);
    expect(player.skipped()).toBe(0);
    expect(player.selected()).toBe(0);
    player.play();
    expect(player.playing()).toBe(true);
  });

  it('continues into newly fetched audio after the current track ends', async () => {
    const nextPage = new Subject<MediaFeedPage>();
    await player.scan.start((cursor) =>
      cursor
        ? nextPage
        : of({ statuses: Array.from({ length: 20 }, (_, i) => post(String(i))), next: 'next' }),
    );
    player.select(19);
    audios[0].dispatchEvent(new Event('ended'));
    nextPage.next({ statuses: [post('20')], next: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.current()?.post.id).toBe('20');
    expect(player.playing()).toBe(true);
  });
});
