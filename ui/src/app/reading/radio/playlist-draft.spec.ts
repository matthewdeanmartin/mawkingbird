import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { Status } from '../../platform/api/models';
import { PlaylistDraft } from './playlist-draft';
import { RadioTrack } from './radio-player';

function track(id: string): RadioTrack {
  const media = { id, type: 'audio', url: `https://audio.example/${id}.mp3` };
  return {
    key: `${id}:${id}`,
    post: { id, media_attachments: [media] } as unknown as Status,
    media,
  } as RadioTrack;
}

describe('PlaylistDraft', () => {
  let draft: PlaylistDraft;
  let token: ReturnType<typeof signal<string>>;
  beforeEach(() => {
    token = signal('first');
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { kind: signal('mastodon'), token } },
        { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
      ],
    });
    draft = TestBed.inject(PlaylistDraft);
    TestBed.tick();
  });

  const ids = () => draft.tracks().map((item) => item.post.id);

  it('adds without duplicates, reorders, renames and removes', () => {
    expect(draft.add([track('a'), track('b'), track('a')])).toBe(2);
    expect(draft.add([track('b'), track('c')])).toBe(1);
    expect(ids()).toEqual(['a', 'b', 'c']);
    draft.move(0, 1);
    expect(ids()).toEqual(['b', 'a', 'c']);
    draft.move(2, 1);
    expect(ids()).toEqual(['b', 'a', 'c']);
    draft.rename(1, '  Side A  ');
    expect(draft.tracks()[1].title).toBe('Side A');
    draft.rename(1, ' ');
    expect(draft.tracks()[1].title).toBeUndefined();
    draft.remove(0);
    expect(ids()).toEqual(['a', 'c']);
  });

  it('replaces tracks with a name and description, then clears on account change', () => {
    draft.replace([track('x'), track('x'), track('y')], 'Mix', 'Notes');
    expect(ids()).toEqual(['x', 'y']);
    expect(draft.name()).toBe('Mix');
    expect(draft.description()).toBe('Notes');
    token.set('second');
    TestBed.tick();
    expect(draft.tracks()).toEqual([]);
    expect(draft.name()).toBe('');
  });
});
