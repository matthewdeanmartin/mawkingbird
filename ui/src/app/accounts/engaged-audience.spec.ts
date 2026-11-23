import { describe, expect, it } from 'vitest';
import { MastodonNotification, Status } from '../platform/api/models';
import { EngagedAccumulator, HOURS, level, postingGrid, slotOf } from './engaged-audience';

/** Local time, so slots line up with the reader's clock as the panel does. */
function at(day: number, hour: number, minute = 0): number {
  // 2026-11-22 is a Sunday; day 0 = Sunday.
  return new Date(2026, 10, 22 + day, hour, minute).getTime();
}

function n(
  type: string,
  person: string,
  when: number,
  extra: { content?: string; language?: string | null; note?: string } = {},
): MastodonNotification {
  return {
    id: String(when),
    type,
    created_at: new Date(when).toISOString(),
    account: { id: person, note: extra.note ?? '' },
    status: {
      id: 's',
      content: extra.content ?? '',
      language: extra.language ?? null,
    } as Status,
  } as MastodonNotification;
}

describe('slotOf', () => {
  it('is weekday × 24 + hour in local time', () => {
    expect(slotOf(at(0, 0))).toBe(0);
    expect(slotOf(at(2, 9, 30))).toBe(2 * HOURS + 9);
  });
});

describe('EngagedAccumulator', () => {
  it('counts each person once per slot, and once per day', () => {
    const acc = new EngagedAccumulator();
    acc.add(n('favourite', 'fan', at(1, 9)));
    acc.add(n('favourite', 'fan', at(1, 9, 30)));
    acc.add(n('reblog', 'fan', at(1, 10)));
    acc.add(n('favourite', 'other', at(1, 9, 5)));
    acc.add(n('follow', 'ignored', at(1, 9)));
    const s = acc.summary();
    expect(s.people).toBe(2);
    expect(s.reactions).toBe(4);
    expect(s.grid[1][9]).toBe(2);
    expect(s.grid[1][10]).toBe(1);
    expect(s.peak).toBe(2);
    expect(s.best[0]).toEqual({ day: 1, hour: 9, people: 2 });
    expect(s.best).toHaveLength(2);
    expect(s.byDay[1]).toBe(2);
  });

  it('detects reply and bio languages, one bio per person', () => {
    const acc = new EngagedAccumulator();
    const german = 'Das ist wirklich ein sehr schöner Beitrag, vielen Dank dafür und bis bald';
    acc.add(n('mention', 'a', at(0, 1), { content: `<p>${german}</p>`, language: 'de' }));
    acc.add(n('mention', 'a', at(0, 2), { content: `<p>${german}</p>`, language: 'de' }));
    acc.add(
      n('favourite', 'b', at(0, 3), {
        note: '<p>I write about the weather and the history of the city where I live</p>',
      }),
    );
    acc.add(n('favourite', 'b', at(0, 4), { note: '<p>Ich schreibe</p>' }));
    const s = acc.summary();
    expect(s.replies).toBe(2);
    expect(s.replyLanguages[0].lang).toBe('de');
    expect(s.bios).toBe(1);
    expect(s.bioLanguages[0].lang).toBe('en');
  });

  it('summarizes nothing as empty', () => {
    const s = new EngagedAccumulator().summary();
    expect(s.people).toBe(0);
    expect(s.peak).toBe(0);
    expect(s.best).toEqual([]);
  });
});

describe('postingGrid and level', () => {
  it('counts posts per slot and shades by share of the peak', () => {
    const grid = postingGrid([at(3, 14), at(3, 14, 20), at(5, 8)]);
    expect(grid[3][14]).toBe(2);
    expect(grid[5][8]).toBe(1);
    expect(level(0, 4)).toBe(0);
    expect(level(1, 4)).toBe(1);
    expect(level(4, 4)).toBe(4);
    expect(level(3, 0)).toBe(0);
  });
});
