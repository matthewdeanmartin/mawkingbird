import { describe, expect, it } from 'vitest';
import { autoSplit, postLength } from './index';

describe('weighted thread text', () => {
  it('keeps an oversized URL whole at the start and after prose', () => {
    const url = 'https://example.org';
    const options = { limit: 5, urlWeight: 23 };
    expect(autoSplit(url + ' tail', options)).toEqual([url, 'tail']);
    expect(autoSplit('hello ' + url + ' tail', options)).toEqual(['hello', url, 'tail']);
  });

  it('counts a complete URL at the supplied width and an astral character once', () => {
    expect(postLength('😀https://example.org!', 2)).toBe(4);
    expect(autoSplit('😀😀😀', { limit: 2, urlWeight: 2 })).toEqual(['😀😀', '😀']);
  });
});
