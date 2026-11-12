import { describe, expect, it } from 'vitest';
import {
  EXCERPT_HEAD,
  EXCERPT_MAX_PASSAGES,
  EXCERPT_THRESHOLD,
  excerptTermsFor,
  markTerms,
  plainText,
  searchExcerpt,
} from './search-excerpt';

const filler = (words: number, word = 'lorem') =>
  Array.from({ length: words }, () => word).join(' ');

describe('excerptTermsFor', () => {
  it('keeps words and quoted phrases, dropping exclusions and operators', () => {
    expect(
      excerptTermsFor('Gardening "raised beds" -weeds from:@me has:media #Compost @alice'),
    ).toEqual(['gardening', 'raised beds', 'compost', 'alice']);
    expect(excerptTermsFor('-"not this" a ok')).toEqual(['ok']);
  });
});

describe('plainText', () => {
  it('keeps paragraph breaks as spaces and drops markup', () => {
    expect(plainText('<p>one</p><p>two<br>three <a href="x">link</a></p>')).toBe(
      'one two three link',
    );
  });
});

describe('searchExcerpt', () => {
  it('leaves posts at or under the threshold whole', () => {
    expect(searchExcerpt(`<p>${'a'.repeat(EXCERPT_THRESHOLD)}</p>`, ['a'])).toBeNull();
  });

  it('keeps the opening, cut at a word, plus marked passages around later matches', () => {
    const html = `<p>${filler(100)} needle ${filler(100)}</p>`;
    const excerpt = searchExcerpt(html, ['needle'])!;
    const head = excerpt.head.map((p) => p.text).join('');
    expect(head.length).toBeLessThanOrEqual(EXCERPT_HEAD + 1);
    expect(head.endsWith('lorem…')).toBe(true);
    expect(excerpt.passages).toHaveLength(1);
    const passage = excerpt.passages[0];
    expect(passage.find((p) => p.match)?.text).toBe('needle');
    expect(passage[0].text.startsWith('…')).toBe(true);
    expect(excerpt.length).toBeGreaterThan(EXCERPT_THRESHOLD);
  });

  it('merges nearby matches and stops at the passage limit', () => {
    const near = `${filler(100)} cat dog cat ${filler(100)}`;
    expect(searchExcerpt(near, ['cat', 'dog'])!.passages).toHaveLength(1);

    const many = [filler(90), ...Array.from({ length: 6 }, () => `cat ${filler(60)}`)].join(' ');
    expect(searchExcerpt(many, ['cat'])!.passages).toHaveLength(EXCERPT_MAX_PASSAGES);
  });

  it('shows just the opening when nothing matches after it', () => {
    const excerpt = searchExcerpt(`needle ${filler(200)}`, ['needle'])!;
    expect(excerpt.passages).toEqual([]);
    expect(excerpt.head[0]).toEqual({ text: 'needle', match: true });
  });

  it('never treats the post as markup', () => {
    const html = `<p>${filler(150)} &lt;script&gt;x&lt;/script&gt; needle</p>`;
    const text = searchExcerpt(html, ['needle'])!
      .passages.flat()
      .map((p) => p.text)
      .join('');
    expect(text).toContain('<script>x</script>');
  });
});

describe('markTerms', () => {
  it('marks every match case-insensitively, longest term first', () => {
    const pattern = /raised beds|beds/gi;
    expect(markTerms('Raised beds and beds', pattern)).toEqual([
      { text: 'Raised beds', match: true },
      { text: ' and ', match: false },
      { text: 'beds', match: true },
    ]);
  });
});
