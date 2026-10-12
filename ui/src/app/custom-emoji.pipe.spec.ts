import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CustomEmojiPipe } from './custom-emoji.pipe';
import { CustomEmoji } from './models';

const emoji: CustomEmoji = {
  shortcode: 'foobar',
  url: 'https://remote.example/animated.gif',
  static_url: 'https://remote.example/emoji.png',
  visible_in_picker: true,
};

describe('CustomEmojiPipe', () => {
  const pipe = () => TestBed.runInInjectionContext(() => new CustomEmojiPipe());

  it('uses the post’s supplied emoji URL and keeps unknown shortcodes readable', () => {
    const html = pipe().transform('<p>Hello :foobar: :unknown:</p>', [emoji]);
    expect(html).toContain('src="https://remote.example/emoji.png"');
    expect(html).toContain('alt=":foobar:"');
    expect(html).toContain(':unknown:');
  });

  it('does not rewrite URL attributes, code or existing emoji images', () => {
    const html =
      '<a href="https://example.test/:foobar:">link</a><code>:foobar:</code><img alt=":foobar:" src="https://example.test/original.png">';
    const root = document.createElement('div');
    root.innerHTML = pipe().transform(html, [emoji]);
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.test/:foobar:');
    expect(root.querySelector('code')?.textContent).toBe(':foobar:');
    expect(root.querySelectorAll('img')).toHaveLength(1);
  });

  it('escapes display names and rejects unsafe emoji URLs', () => {
    const html = pipe().transform('<b>Alice</b> :foobar:', [emoji], true);
    expect(html).toContain('&lt;b&gt;Alice&lt;/b&gt;');
    expect(html).toContain('class="custom-emoji"');
    expect(pipe().transform(':foobar:', [{ ...emoji, static_url: 'javascript:alert(1)' }])).toBe(
      ':foobar:',
    );
  });
});
