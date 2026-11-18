import { describe, expect, it } from 'vitest';
import { chaptersFromDescription, keywordFilterAction } from './youtube-details';

describe('chaptersFromDescription', () => {
  it('reads YouTube-style chapter lists, including hours and decorations', () => {
    expect(
      chaptersFromDescription(
        'Thanks for watching!\n\n0:00 Intro\n- 02:15 - The problem\n(1:02:03) Wrap-up\nhttps://example.org',
      ),
    ).toEqual([
      { seconds: 0, title: 'Intro' },
      { seconds: 135, title: 'The problem' },
      { seconds: 3723, title: 'Wrap-up' },
    ]);
  });

  it('ignores timestamps that YouTube would not treat as chapters', () => {
    // Fewer than three.
    expect(chaptersFromDescription('0:00 Intro\n5:00 End')).toEqual([]);
    // Not starting at zero.
    expect(chaptersFromDescription('0:30 A\n1:00 B\n2:00 C')).toEqual([]);
    // Prose mentioning a time.
    expect(chaptersFromDescription('The fun starts at 3:15, trust me.')).toEqual([]);
  });

  it('skips out-of-order stamps rather than inventing negative chapters', () => {
    expect(
      chaptersFromDescription('0:00 A\n2:00 B\n1:00 typo\n3:00 C').map((c) => c.title),
    ).toEqual(['A', 'B', 'C']);
  });
});

describe('keywordFilterAction', () => {
  const filter = (
    keyword: string,
    action: string,
    extra: Partial<{ whole_word: boolean; context: string[]; expires_at: string | null }> = {},
  ) => ({
    context: extra.context ?? ['thread'],
    filter_action: action,
    expires_at: extra.expires_at ?? null,
    keywords: [{ keyword, whole_word: extra.whole_word ?? true }],
  });

  it('applies the reader’s thread filters to outside text; hide beats warn', () => {
    expect(keywordFilterAction('Spoilers ahead!', [filter('spoilers', 'warn')])).toBe('warn');
    expect(
      keywordFilterAction('spoilers and crypto', [
        filter('spoilers', 'warn'),
        filter('crypto', 'hide'),
      ]),
    ).toBe('hide');
    expect(keywordFilterAction('nothing here', [filter('crypto', 'hide')])).toBeNull();
  });

  it('matches whole words in any script, and substrings when asked', () => {
    expect(keywordFilterAction('cryptography', [filter('crypto', 'hide')])).toBeNull();
    expect(
      keywordFilterAction('cryptography', [filter('crypto', 'hide', { whole_word: false })]),
    ).toBe('hide');
    expect(keywordFilterAction('Größe zählt', [filter('größe', 'warn')])).toBe('warn');
    expect(keywordFilterAction('a+b (c)', [filter('a+b', 'warn')])).toBe('warn');
  });

  it('ignores filters for other contexts and expired ones', () => {
    expect(
      keywordFilterAction('crypto', [filter('crypto', 'hide', { context: ['home'] })]),
    ).toBeNull();
    expect(
      keywordFilterAction('crypto', [
        filter('crypto', 'hide', { expires_at: '2020-01-01T00:00:00Z' }),
      ]),
    ).toBeNull();
  });
});
