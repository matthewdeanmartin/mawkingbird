import { describe, expect, it } from 'vitest';
import { DEFAULT_URL_WEIGHT, findUrls, longUrls, postLength } from './post-length';

/**
 * The URL from the bug report: an ordinary Amazon product link, complete with
 * the `dib=` tracking blob Amazon appends. 700-odd characters, and the reason
 * the composer used to refuse a two-line post.
 */
const AMAZON_URL =
  'https://www.amazon.com/Code-Woosters-1-P-Wodehouse-ebook/dp/B087X8F5KV/ref=sr_1_1?crid=14KE7VSB3A8L9&dib=eyJ2IjoiMSJ9.DNyA44IDlgTPKvUHphfRWIowwOqcdydXhVCzxlyRdwEDA5RCKXRD91EewIkJtGhRtwlKP_BOBdutcrRiSpNbeMEzYVWFNJAZwk77k9NwPp5ny4iSFyyrFEnsq4nm5x_sUHMXcB0uUjPQ9jSuKrF0gyIZdd7ki_Xbl5XGM1Y4MgcgwALuS35OLMvpGsaDBZL8nrNMLLqPzf_lTa_iB54wH_HF4p-geVMjHbmmFaE0tKc._-DgnZpFpKcsLvMgaN-yNLDUqQvb3mqXKrHispa8U8s&dib_tag=se&keywords=code+of+the+woosters&qid=1785516243&sprefix=code+of+the+%2Caps%2C631&sr=8-1';

describe('postLength', () => {
  it('counts a plain post as its character length', () => {
    expect(postLength('Hello there.')).toBe(12);
  });

  it('counts any URL as the reserved width, however long it is', () => {
    // The whole point: the server substitutes a fixed-width placeholder before
    // counting, so length of the URL itself is irrelevant.
    expect(postLength('https://a.co')).toBe(DEFAULT_URL_WEIGHT);
    expect(postLength(AMAZON_URL)).toBe(DEFAULT_URL_WEIGHT);
  });

  it('accepts the exact post from the bug report', () => {
    const post = `Not scifi, but I read this recently.\n\n${AMAZON_URL}`;

    // Raw string length is ~700 and used to trigger "whoa 500 char limit".
    expect(post.length).toBeGreaterThan(500);
    // As the server counts it: 36 characters of prose, two newlines, and 23 for
    // the link — comfortably inside the limit, which is the whole complaint.
    expect(postLength(post)).toBe(61);
    expect(postLength(post)).toBeLessThanOrEqual(500);
  });

  it('counts several URLs independently', () => {
    expect(postLength(`${AMAZON_URL} and ${AMAZON_URL}`)).toBe(DEFAULT_URL_WEIGHT * 2 + 5);
  });

  it('counts the prose around a URL normally', () => {
    expect(postLength('see https://example.com/x now')).toBe(4 + DEFAULT_URL_WEIGHT + 4);
  });

  it('honours a different reserved width, for an instance that sets one', () => {
    expect(postLength(AMAZON_URL, 30)).toBe(30);
  });

  it('counts an astral-plane character as one, not two UTF-16 units', () => {
    // '🦣'.length is 2 in JavaScript; Mastodon counts it once.
    expect(postLength('🦣')).toBe(1);
    expect(postLength('a🦣b')).toBe(3);
  });

  it('still catches a genuinely too-long post', () => {
    // The fix must not swing the other way into letting oversized posts through.
    expect(postLength('x'.repeat(501))).toBe(501);
  });
});

describe('findUrls', () => {
  it('does not swallow the full stop that ends a sentence', () => {
    const [found] = findUrls('Read https://example.com/page.');

    expect(found.url).toBe('https://example.com/page');
    // The offsets must address the URL alone, since they drive text splicing.
    expect('Read https://example.com/page.'.slice(found.start, found.end)).toBe(found.url);
  });

  it('ignores bare domains, which Mastodon does not linkify either', () => {
    // Counting these as 23 would swing the error the other way and let a
    // genuinely oversized post reach the server.
    expect(findUrls('visit www.example.com or example.com')).toEqual([]);
  });

  it('ignores a scheme with nothing after it', () => {
    expect(findUrls('https://')).toEqual([]);
  });

  it('reports offsets in order, so back-to-front splicing works', () => {
    const found = findUrls('a https://one.example b https://two.example');

    expect(found.map((entry) => entry.url)).toEqual(['https://one.example', 'https://two.example']);
    expect(found[0].start).toBeLessThan(found[1].start);
  });
});

describe('longUrls', () => {
  it('reports only URLs longer than the reserved width', () => {
    // A short link already costs 23; shortening it would spend quota for nothing.
    expect(longUrls('https://a.co')).toEqual([]);
    expect(longUrls(AMAZON_URL)).toHaveLength(1);
  });

  it('is empty for a post with no links at all', () => {
    expect(longUrls('no links here')).toEqual([]);
  });
});
