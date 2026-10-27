import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { postTitle, trackTitle } from './track-title';

function post(content: string, display_name = 'Singer'): Status {
  return { content, account: { display_name, acct: 'singer@sea.example' } } as Status;
}

describe('track titles', () => {
  it('uses the first line of post text that is not only links, mentions or tags', () => {
    expect(
      postTitle(
        post(
          '<p><a href="https://w.example/x">https://soundcloud.com/a/b</a><br>#music @dj</p><p>Night &amp; Day – live take</p>',
        ),
      ),
    ).toBe('Night & Day – live take');
    expect(postTitle(post('<p>#nowplaying https://x.example/y</p>'))).toBe('');
  });

  it('clips long lines at a word boundary', () => {
    const title = postTitle(post(`<p>${'word '.repeat(40)}</p>`));
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('word…')).toBe(true);
  });

  it('cascades from reported metadata to description, post text and author', () => {
    const native = {
      post: post('<p>From the post</p>'),
      media: { description: '\nTape one\nmore' },
    };
    expect(trackTitle(native, 'Reported')).toBe('Reported');
    expect(trackTitle(native)).toBe('Tape one');
    // An external track's description is only the provider label.
    expect(trackTitle({ ...native, external: {}, media: { description: 'SoundCloud' } })).toBe(
      'From the post',
    );
    expect(trackTitle({ post: post('<p>https://a.example</p>'), media: {} })).toBe('Singer');
    expect(trackTitle({ post: post('', ''), media: {} })).toBe('singer@sea.example');
  });
});
