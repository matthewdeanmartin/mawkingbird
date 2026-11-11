import { describe, expect, it } from 'vitest';
import {
  autoSplit,
  bodyToBoxes,
  boxesToBody,
  insertSplitAt,
  isObviousSingleton,
  isSplitRule,
  segmentsFor,
  splitOnRule,
  splitText,
} from './split-modes';

describe('isObviousSingleton', () => {
  it('skips split review for one short line', () => {
    expect(isObviousSingleton('A concise post.', 500)).toBe(true);
  });

  it('keeps review for a newline, marker, or the exact limit', () => {
    expect(isObviousSingleton('line one\nline two', 500)).toBe(false);
    expect(isObviousSingleton('before --- after', 500)).toBe(false);
    expect(isObviousSingleton('x'.repeat(500), 500)).toBe(false);
  });

  it('uses server-style URL weighting', () => {
    expect(isObviousSingleton(`see https://example.com/${'x'.repeat(700)}`, 500)).toBe(true);
  });
});

const LIMIT = 500;

describe('isSplitRule', () => {
  it('matches exactly three dashes, with or without surrounding space', () => {
    expect(isSplitRule('---')).toBe(true);
    expect(isSplitRule('  ---  ')).toBe(true);
  });

  it('leaves longer dash runs alone', () => {
    // People type these as decoration inside a post; swallowing them would
    // silently break somebody's ASCII art into two posts.
    expect(isSplitRule('----')).toBe(false);
    expect(isSplitRule('--------')).toBe(false);
    expect(isSplitRule('--')).toBe(false);
  });

  it('does not match a rule with other text on the line', () => {
    expect(isSplitRule('--- and then')).toBe(false);
  });
});

describe('splitOnRule', () => {
  it('splits on rule lines and trims each segment', () => {
    expect(splitOnRule('first\n---\nsecond\n---\nthird')).toEqual(['first', 'second', 'third']);
  });

  it('keeps line breaks inside a segment', () => {
    expect(splitOnRule('one\ntwo\n---\nthree')).toEqual(['one\ntwo', 'three']);
  });

  it('drops empty segments from leading, trailing and doubled rules', () => {
    // Someone mid-edit, not someone asking to publish an empty post.
    expect(splitOnRule('---\nbody\n---\n---\n')).toEqual(['body']);
  });

  it('returns nothing for an empty or whitespace-only body', () => {
    expect(splitOnRule('')).toEqual([]);
    expect(splitOnRule('   \n\n  ')).toEqual([]);
  });

  it('returns a single segment when there is no rule', () => {
    expect(splitOnRule('just one post')).toEqual(['just one post']);
  });
});

describe('autoSplit', () => {
  it('leaves a body that already fits as one segment', () => {
    expect(autoSplit('short enough', { limit: LIMIT })).toEqual(['short enough']);
  });

  it('prefers paragraph breaks', () => {
    const first = 'a'.repeat(60);
    const second = 'b'.repeat(60);
    const parts = autoSplit(`${first}\n\n${second}`, { limit: 100 });
    expect(parts).toEqual([first, second]);
  });

  it('falls back to sentence ends when there is no paragraph break', () => {
    const parts = autoSplit(`${'a'.repeat(60)}. ${'b'.repeat(30)}.`, { limit: 70 });
    expect(parts[0]).toBe(`${'a'.repeat(60)}.`);
    expect(parts[1]).toBe(`${'b'.repeat(30)}.`);
  });

  it('falls back to a word boundary when there is no sentence end', () => {
    const parts = autoSplit(`${'a'.repeat(40)} ${'b'.repeat(40)}`, { limit: 50 });
    expect(parts).toEqual(['a'.repeat(40), 'b'.repeat(40)]);
  });

  it('keeps every segment within the limit', () => {
    const body = Array.from({ length: 40 }, (_, i) => `Sentence number ${i}.`).join(' ');
    for (const segment of autoSplit(body, { limit: 100 })) {
      expect(segment.length).toBeLessThanOrEqual(100);
    }
  });

  it('never cuts inside a URL', () => {
    const url = 'https://example.com/a-very-long-path-that-would-otherwise-be-cut-in-half';
    const body = `${'a'.repeat(40)} ${url} tail`;
    const parts = autoSplit(body, { limit: 50 });
    // The link survives intact in exactly one segment.
    expect(parts.filter((p) => p.includes(url))).toHaveLength(1);
    for (const part of parts) {
      expect(part.includes('https://example.com/a-very-long-path')).toBe(part.includes(url));
    }
  });

  it('counts a URL at its reserved width, not its real length', () => {
    // A 70-char URL costs 23, so this whole body fits in one post even though
    // its string length is well over the limit.
    const url = `https://example.com/${'p'.repeat(50)}`;
    expect(url.length).toBeGreaterThan(60);
    expect(autoSplit(`see ${url}`, { limit: 40 })).toEqual([`see ${url}`]);
  });

  it('cuts an unbroken run rather than looping forever', () => {
    const parts = autoSplit('x'.repeat(250), { limit: 100 });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe('x'.repeat(250));
  });

  it('returns nothing for an empty body', () => {
    expect(autoSplit('   ', { limit: LIMIT })).toEqual([]);
  });
});

describe('splitText in demand mode', () => {
  it('keeps the whole body as one segment, rules and all', () => {
    expect(splitText('one\n---\ntwo', 'demand', { limit: LIMIT })).toEqual(['one\n---\ntwo']);
  });

  it('returns nothing for an empty body', () => {
    expect(splitText('  ', 'demand', { limit: LIMIT })).toEqual([]);
  });
});

describe('segmentsFor', () => {
  it('measures each segment and marks the over-limit ones', () => {
    const segments = segmentsFor(`short\n---\n${'x'.repeat(40)}`, 'rule', { limit: 20 });
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ text: 'short', length: 5, overLimit: false });
    expect(segments[1]).toMatchObject({ length: 40, overLimit: true });
  });

  it('measures with URL weighting rather than string length', () => {
    const url = `https://example.com/${'p'.repeat(60)}`;
    const [segment] = segmentsFor(url, 'rule', { limit: LIMIT });
    expect(segment.length).toBe(23);
    expect(segment.overLimit).toBe(false);
  });
});

describe('insertSplitAt', () => {
  it('inserts a rule at the caret and returns the caret after it', () => {
    const result = insertSplitAt('one two', 3);
    expect(result.text).toBe('one\n\n---\n\ntwo');
    expect(result.text.slice(result.caret)).toBe('two');
  });

  it('does not leave doubled whitespace around the marker', () => {
    expect(insertSplitAt('one   \n\n   two', 6).text).toBe('one\n\n---\n\ntwo');
  });

  it('clamps a caret outside the body', () => {
    expect(insertSplitAt('body', 999).text).toBe('body\n\n---\n\n');
    expect(insertSplitAt('body', -5).text).toBe('\n\n---\n\nbody');
  });
});

describe('boxes mode', () => {
  const THREAD = 'first post\n\n---\n\nsecond post';

  /**
   * The whole reason `boxes` reuses `rule`'s storage: a thread written one way
   * has to open correctly the other way, or the toggle silently rewrites drafts.
   */
  it('splits the same way the --- mode does', () => {
    expect(splitText(THREAD, 'boxes', { limit: 500 })).toEqual(
      splitText(THREAD, 'rule', { limit: 500 }),
    );
  });

  it('round-trips a body through boxes and back unchanged', () => {
    expect(boxesToBody(bodyToBoxes(THREAD))).toBe(THREAD);
  });

  it('treats a body with no marker as a single box', () => {
    expect(bodyToBoxes('just the one')).toEqual(['just the one']);
  });

  it('gives an empty body one empty box to type into', () => {
    expect(bodyToBoxes('')).toEqual(['']);
  });

  /**
   * Unlike the publish-time split, editing keeps empty boxes: a box you just
   * added with [+] has to stay on screen long enough to type into.
   */
  it('keeps an empty box while editing but drops it at publish time', () => {
    const body = boxesToBody(['written', '']);
    expect(bodyToBoxes(body)).toEqual(['written', '']);
    expect(splitText(body, 'boxes', { limit: 500 })).toEqual(['written']);
  });

  it('trims each box rather than storing the padding around the marker', () => {
    expect(boxesToBody(['  one  ', '  two  '])).toBe(
      THREAD.replace('first post', 'one').replace('second post', 'two'),
    );
  });
});
