import { hashtagUses, sortHashtags } from './hashtag-activity';
import { Hashtag } from '../../platform/api/models';

const tag = (name: string): Hashtag => ({ name, url: '' });
const day = (uses: string) => ({ day: '1', uses, accounts: '1' });

describe('hashtag activity', () => {
  it('sums usage history and treats a missing or empty history as unknown', () => {
    expect(hashtagUses([day('3'), day('0'), day('4')])).toBe(7);
    expect(hashtagUses([day('0'), day('0')])).toBe(0);
    expect(hashtagUses([])).toBeNull();
    expect(hashtagUses(undefined)).toBeNull();
  });

  it('keeps server order for relevance', () => {
    const tags = [tag('b'), tag('a')];
    expect(sortHashtags(tags, 'relevance', () => 0).map((t) => t.name)).toEqual(['b', 'a']);
  });

  it('sorts alphabetically ignoring case', () => {
    const tags = [tag('Zebra'), tag('apple'), tag('Mango')];
    expect(sortHashtags(tags, 'alpha', () => 0).map((t) => t.name)).toEqual([
      'apple',
      'Mango',
      'Zebra',
    ]);
  });

  it('sorts busiest first, unknown counts last, stable within ties', () => {
    const counts: Record<string, number | null> = { a: 0, b: 12, c: null, d: 12, e: 3 };
    const tags = ['a', 'b', 'c', 'd', 'e'].map(tag);
    expect(sortHashtags(tags, 'activity', (t) => counts[t.name]).map((t) => t.name)).toEqual([
      'b',
      'd',
      'e',
      'a',
      'c',
    ]);
  });
});
