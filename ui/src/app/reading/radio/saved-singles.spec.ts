import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowTrust } from '../../accounts/follow-trust';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { Playback } from '../video-player/playback';
import { isContinuous, RadioPlayer } from './radio-player';
import { SavedSingles, SINGLES_LIMIT } from './saved-singles';

function post(id: string, content = ''): Status {
  return {
    id,
    url: `https://sea.example/@singer/${id}`,
    visibility: 'public',
    account: { acct: 'singer', display_name: 'Singer' },
    content,
    media_attachments: content
      ? []
      : [{ id: `m${id}`, type: 'audio', url: `https://audio.example/${id}.mp3` }],
  } as unknown as Status;
}

describe('SavedSingles', () => {
  let singles: SavedSingles;
  let player: RadioPlayer;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { kind: signal('mastodon'), token: signal('t') } },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
      ],
    });
    singles = TestBed.inject(SavedSingles);
    player = TestBed.inject(RadioPlayer);
  });

  it('keeps Singles newest first without duplicates, and survives a reload', () => {
    expect(singles.save(player.singlesOf(post('1')))).toBe(1);
    expect(singles.save([...player.singlesOf(post('2')), ...player.singlesOf(post('1'))])).toBe(1);
    expect(singles.items().map((item) => item.track.post.id)).toEqual(['2', '1']);
    singles.items.set([]);
    singles.refresh();
    expect(singles.items().map((item) => item.track.post.id)).toEqual(['2', '1']);
    expect(singles.has(singles.items()[0].track.key)).toBe(true);
    singles.remove(singles.items()[0].track.key);
    expect(singles.items().map((item) => item.track.post.id)).toEqual(['1']);
  });

  it('keeps a player that only plays on its own page, marked as not continuous', () => {
    const [track] = player.singlesOf(
      post('s', '<a href="https://open.spotify.com/track/abc123">x</a>'),
    );
    expect(track.external?.provider).toBe('spotify');
    expect(isContinuous(track)).toBe(false);
    singles.save([track]);
    singles.refresh();
    expect(singles.items()[0].track.key).toBe(track.key);
    // A playlist queue never takes it.
    player.playTracks([track]);
    expect(player.queue()).toEqual([]);
  });

  it('drops stored rows that no longer describe a recording, and caps the list', () => {
    localStorage.setItem(
      'mockingbird_radio_singles' + accountScopeSuffix(),
      JSON.stringify([{ track: { key: 'x', post: { id: 'x' } } }, 'junk']),
    );
    singles.refresh();
    expect(singles.items()).toEqual([]);
    const many = Array.from(
      { length: SINGLES_LIMIT + 3 },
      (_, i) => player.singlesOf(post(String(i)))[0],
    );
    singles.save(many);
    expect(singles.items()).toHaveLength(SINGLES_LIMIT);
  });
});
