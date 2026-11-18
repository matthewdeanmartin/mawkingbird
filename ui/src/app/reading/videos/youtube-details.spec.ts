import { describe, expect, it } from 'vitest';
import { chaptersFromDescription } from './youtube-details';

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
