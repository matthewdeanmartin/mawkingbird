import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { entryText, playlistThreads, postRecordings, rootText } from './playlist-thread';

let next = 0;
function post(content: string, extra: Partial<Status> = {}): Status {
  return {
    id: String(++next),
    content,
    account: { id: 'me' },
    media_attachments: [],
    created_at: `2026-10-27T00:00:${String(next).padStart(2, '0')}Z`,
    ...extra,
  } as unknown as Status;
}

describe('playlist threads', () => {
  it('counts one song shared on several services as one recording', () => {
    expect(
      postRecordings(
        post(
          '<p>New single!</p><p><a href="https://open.spotify.com/track/a">Spotify</a><br><a href="https://music.apple.com/us/album/x/1?i=2">Apple</a><br><a href="https://soundcloud.com/me/single">SoundCloud</a></p>',
        ),
      ),
    ).toHaveLength(1);
  });

  it('counts numbered lines, attachments and files as separate recordings', () => {
    expect(
      postRecordings(
        post(
          '<p>1. One <a href="https://a.example/1.mp3">x</a><br>2) Two <a href="https://soundcloud.com/me/two">y</a></p>',
          {
            media_attachments: [{ id: 'm', type: 'audio', url: 'https://f.example/m.mp3' }],
          } as Partial<Status>,
        ),
      ),
    ).toHaveLength(3);
    expect(
      postRecordings(post('<p>Just words <a href="https://example.org/">link</a></p>')),
    ).toEqual([]);
  });

  it('pairs a numbered title line with the link on the next line', () => {
    expect(
      postRecordings(
        post(
          '<p>1. One<br><a href="https://a.example/1.mp3">https://a.example/1.mp3</a><br>2. Two<br><a href="https://a.example/2.mp3">https://a.example/2.mp3</a></p>',
        ),
      ),
    ).toHaveLength(2);
  });

  it('finds self-reply threads with two or more recordings and ignores others', () => {
    const root = post('<p>Sea songs</p>');
    const one = post('<p>1. A <a href="https://a.example/a.mp3">a</a></p>', {
      in_reply_to_id: root.id,
      in_reply_to_account_id: 'me',
    });
    const two = post('<p>2. B <a href="https://a.example/b.mp3">b</a></p>', {
      in_reply_to_id: one.id,
      in_reply_to_account_id: 'me',
    });
    const single = post('<p><a href="https://a.example/c.mp3">c</a></p>');
    const reply = post('<p><a href="https://a.example/d.mp3">d</a></p>', {
      in_reply_to_id: 'someone-else',
      in_reply_to_account_id: 'other',
    });
    const boosted = post('', { reblog: root });
    const threads = playlistThreads([two, single, reply, one, root, boosted], 'me');
    expect(threads.map((thread) => thread.root.id)).toEqual([root.id]);
    expect(threads[0].posts.map((item) => item.id)).toEqual([root.id, one.id, two.id]);
    expect(threads[0].recordings).toBe(2);
  });

  it('writes a named root and numbered one-track replies', () => {
    expect(rootText(' Sea songs ', '', 3, '{{count}} tracks')).toBe('Sea songs\n\n3 tracks');
    expect(entryText(1, '  Blow  the man ', 'https://a.example/b.mp3')).toBe(
      '2. Blow the man\nhttps://a.example/b.mp3',
    );
  });
});
