import { describe, expect, it } from 'vitest';
import { DEFAULT_BLOG_THRESHOLDS } from './blog-classifier';
import { blogVerdict, bodyMarked, bodyTitle, withBodyTitle } from './blog-write';

describe('blog-write', () => {
  it('reads the title and marker from the first line', () => {
    expect(bodyTitle('Bees\nThey dance.')).toBe('Bees');
    expect(bodyTitle('BLOG: Bees\nx')).toBe('Bees');
    expect(bodyMarked('blog: Bees')).toBe(true);
    expect(bodyMarked('Bees\nBLOG: x')).toBe(false);
    expect(bodyTitle('')).toBe('');
  });

  it('writes the title into the first line, keeping the rest', () => {
    expect(withBodyTitle('Old\nBody', 'New', false)).toBe('New\nBody');
    expect(withBodyTitle('Old\nBody', 'New', true)).toBe('BLOG: New\nBody');
    expect(withBodyTitle('', 'Only', false)).toBe('Only');
    expect(withBodyTitle('Old\nBody', '', false)).toBe('\nBody');
    expect(withBodyTitle('Old', '', true)).toBe('BLOG:');
    expect(withBodyTitle('Old\nBody', 'Two\nlines', false)).toBe('Two lines\nBody');
  });

  it('round-trips a marker toggle', () => {
    const marked = withBodyTitle('Bees\nBody', bodyTitle('Bees\nBody'), true);
    expect(withBodyTitle(marked, bodyTitle(marked), false)).toBe('Bees\nBody');
  });

  it('judges the parts with the shared classifier, in words', () => {
    const t = DEFAULT_BLOG_THRESHOLDS;
    const say = (n: number) => 'word '.repeat(n).trim();
    expect(blogVerdict([say(30), say(30), say(30)], t)).toMatchObject({
      reason: 'storm',
      posts: 3,
    });
    expect(blogVerdict([say(5), say(5), say(5)], t).reason).toBeNull();
    expect(blogVerdict([say(250)], t)).toMatchObject({ reason: 'long', words: 250 });
    expect(blogVerdict(['BLOG: short'], t).reason).toBe('marked');
    expect(blogVerdict(['short', ''], t)).toMatchObject({ reason: null, posts: 1 });
    expect(blogVerdict(['Tom & Jerry'], t).words).toBe(2);
  });
});
