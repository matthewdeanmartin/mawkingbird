import { describe, expect, it } from 'vitest';
import {
  buildMessageUrl,
  messageStatus,
  messageStatusRouteRef,
  parseMessageParams,
  parseMessageStatusRouteRef,
} from './message-payload';

const BASE = 'https://mawkingbird.com/';

describe('message-payload', () => {
  it('encodes content, CW (from title), and language into the message URL', () => {
    const url = buildMessageUrl(
      { title: 'spicy take', content: 'why did the chicken cross the road?', language: 'markdown' },
      BASE,
    );
    const parsed = new URL(url);
    expect(parsed.search).toBe('');
    expect(parsed.pathname).toMatch(/^\/message\/message-status\./);
    expect(parseMessageStatusRouteRef(parsed.pathname.split('/').at(-1)!)).toEqual({
      content: 'why did the chicken cross the road?',
      spoiler: 'spicy take',
      language: 'markdown',
    });
  });

  it('preserves empty CW and default language in the route payload', () => {
    const url = buildMessageUrl({ title: '  ', content: 'hello', language: 'plaintext' }, BASE);
    const parsed = new URL(url);
    expect(parseMessageStatusRouteRef(parsed.pathname.split('/').at(-1)!)).toEqual({
      content: 'hello',
      spoiler: '',
      language: 'plaintext',
    });
  });

  it('continues to parse the legacy query format', () => {
    const payload = parseMessageParams(
      new URLSearchParams('m=body%20%26%20%3Cstuff%3E&cw=cw&l=python'),
    );
    expect(payload).toEqual({ content: 'body & <stuff>', spoiler: 'cw', language: 'python' });
  });

  it('returns null when no message param is present', () => {
    expect(parseMessageParams(new URLSearchParams('foo=bar'))).toBeNull();
  });

  describe('nesting inside another URL', () => {
    const multiline = 'Tofu salad sandwich recipe:\n- tofu\n- salad\n- bread';

    it('uses a query-free base64url route segment', () => {
      const url = buildMessageUrl(
        { title: 'a b', content: multiline, language: 'plaintext' },
        BASE,
      );
      const parsed = new URL(url);
      const ref = parsed.pathname.split('/').at(-1)!;
      expect(parsed.search).toBe('');
      expect(ref).toMatch(/^message-status\.[A-Za-z0-9_-]+$/);
      expect(parseMessageStatusRouteRef(ref)?.content).toBe(multiline);
    });

    it('survives ordinary outer query serialization without percent nesting', () => {
      const target = buildMessageUrl(
        { title: '', content: multiline, language: 'plaintext' },
        BASE,
      );
      const nested = new URL('https://tinyurl.com/api-create.php');
      nested.searchParams.set('url', target);
      const stored = nested.searchParams.get('url')!;
      const ref = new URL(stored).pathname.split('/').at(-1)!;
      expect(nested.search).not.toContain('%25');
      expect(parseMessageStatusRouteRef(ref)?.content).toBe(multiline);
    });

    it('repairs newer legacy links that expose percent escapes as text', () => {
      const params = new URLSearchParams(
        'm=SMBC%2520robots%250A%250Ahttps%253A%252F%252Fwww.smbc-comics.com%252Fcomic%252Fcrank',
      );
      expect(parseMessageParams(params)?.content).toBe(
        'SMBC robots\n\nhttps://www.smbc-comics.com/comic/crank',
      );
    });

    it('repairs older legacy links that expose encoded pluses as text', () => {
      const params = new URLSearchParams('m=Today%2BI%2Bsaw%2Btwo%2Bfoxes%2Bon%2Bmy%2Brun.');
      expect(parseMessageParams(params)?.content).toBe('Today I saw two foxes on my run.');
    });

    it('does not rewrite an intentional plus expression', () => {
      expect(parseMessageParams(new URLSearchParams('m=C%2B%2B'))?.content).toBe('C++');
      expect(parseMessageParams(new URLSearchParams('m=one%2Btwo'))?.content).toBe('one+two');
    });

    it('still reads correctly form-encoded legacy links', () => {
      expect(parseMessageParams(new URLSearchParams('m=Tofu+salad%3A%0A-+tofu'))?.content).toBe(
        'Tofu salad:\n- tofu',
      );
    });
  });

  it('preserves an empty message (m= present but blank)', () => {
    const payload = parseMessageParams(new URLSearchParams('m='));
    expect(payload).toEqual({ content: '', spoiler: '', language: 'plaintext' });
  });

  it('builds an escaped status carrying the CW as spoiler_text', () => {
    const status = messageStatus(
      { content: 'a & b\n<script>', spoiler: 'heads up', language: 'plaintext' },
      'https://tinyurl.com/abc',
    );
    expect(status.content).toBe('a &amp; b<br>&lt;script&gt;');
    expect(status.spoiler_text).toBe('heads up');
    expect(status.sensitive).toBe(true);
    expect(status.url).toBe('https://tinyurl.com/abc');
    expect(status.provider).toBe('paste');
  });

  it('round-trips a payload through the status route ref', () => {
    const payload = { content: 'body & <stuff>\nline2', spoiler: 'cw', language: 'python' };
    const ref = messageStatusRouteRef(payload);
    expect(ref.startsWith('message-status.')).toBe(true);
    expect(parseMessageStatusRouteRef(ref)).toEqual(payload);
  });

  it('encodes URL-unsafe base64 chars safely in the route ref', () => {
    const ref = messageStatusRouteRef({ content: '???>>>', spoiler: '', language: 'plaintext' });
    // base64url alphabet only: no +, /, or = in the segment.
    expect(ref.slice('message-status.'.length)).toMatch(/^[A-Za-z0-9_-]*$/);
  });

  it('returns null for a non-message-status id', () => {
    expect(parseMessageStatusRouteRef('12345')).toBeNull();
    expect(parseMessageStatusRouteRef('anonymous-status.abc')).toBeNull();
  });

  it('returns null when the ref decodes to something without content', () => {
    const bogus = 'message-status.' + btoa('{"spoiler":"x"}');
    expect(parseMessageStatusRouteRef(bogus)).toBeNull();
  });

  it('defaults spoiler and language when the payload omits them', () => {
    const ref = messageStatusRouteRef({ content: 'hi', spoiler: '', language: 'plaintext' });
    expect(parseMessageStatusRouteRef(ref)).toEqual({
      content: 'hi',
      spoiler: '',
      language: 'plaintext',
    });
  });

  it('is not sensitive when there is no CW', () => {
    const status = messageStatus({ content: 'plain', spoiler: '', language: 'plaintext' }, null);
    expect(status.sensitive).toBe(false);
    expect(status.spoiler_text).toBe('');
  });
});
