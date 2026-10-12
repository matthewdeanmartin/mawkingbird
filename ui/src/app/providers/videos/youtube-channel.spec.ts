import { describe, expect, it } from 'vitest';
import { channelFromHtml, channelInput, videoFeedUrl } from './youtube-channel';

const id = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
describe('YouTube channel resolution', () => {
  it.each([id, `https://www.youtube.com/channel/${id}`, videoFeedUrl(id)])(
    'recognizes stable IDs from %s',
    (input) => {
      expect(channelInput(input)).toEqual({ id });
    },
  );
  it.each([
    '@TechnologyConnections',
    'https://youtube.com/@TechnologyConnections/videos',
    'youtube.com/@TechnologyConnections',
  ])('canonicalizes handles from %s', (input) => {
    expect(channelInput(input)).toEqual({ url: 'https://www.youtube.com/@TechnologyConnections' });
  });
  it('accepts legacy channel aliases and discards tracking queries', () => {
    expect(channelInput('https://m.youtube.com/user/example?feature=share')).toEqual({
      url: 'https://www.youtube.com/user/example',
    });
  });
  it.each([
    'https://youtube.com.evil.test/@x',
    'https://u:p@youtube.com/@x',
    'javascript:alert(1)',
    'https://youtube.com:444/@x',
    'https://youtube.com/watch?v=0KoeY54M5VA',
    'cats',
    `https://youtube.com/channel/${id}/../../watch`,
  ])('rejects non-channel and hostile input %s', (input) => {
    expect(channelInput(input)).toBeNull();
  });
  it('reads RSS and display metadata without executing scripts', () => {
    const html = `<meta property="og:title" content="Example &amp; Co"><link rel="alternate" href="${videoFeedUrl(id)}"><script>throw new Error('must not execute')</script>`;
    expect(channelFromHtml(html)).toEqual({ id, title: 'Example & Co' });
    expect(channelFromHtml('<html>Sign in to continue</html>')).toBeNull();
    expect(
      channelFromHtml(
        `<link rel="alternate" href="https://evil.test/feeds/videos.xml?channel_id=${id}">`,
      ),
    ).toBeNull();
  });
});
