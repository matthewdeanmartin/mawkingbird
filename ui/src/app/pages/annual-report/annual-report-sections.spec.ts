import { describe, expect, it } from 'vitest';
import { Account, Status } from '../../models';
import { humanize, reportSections } from './annual-report-sections';

const alice = { id: 'a1', username: 'alice', acct: 'alice' } as Account;
const post = { id: 's1', content: '<p>Hi</p>' } as Status;

describe('reportSections', () => {
  it('turns a Mastodon report into readable sections', () => {
    const sections = reportSections(
      {
        archetype: 'lurker',
        time_series: [
          { month: 1, statuses: 3, followers: 10 },
          { month: 2, statuses: 1200, followers: 11 },
        ],
        commonly_interacted_with: [
          { account_id: 'a1', count: 4 },
          { account_id: 'gone', count: 1 },
        ],
        top_statuses: { by_reblogs: 's1', by_favourites: 'missing' },
        type_distribution: { total: 10, replies: 4 },
        empty_list: [],
        nothing: null,
      },
      [alice],
      [post],
      'en-US',
    );
    expect(sections.map((s) => s.key)).toEqual([
      'archetype',
      'time_series',
      'commonly_interacted_with',
      'top_statuses',
      'type_distribution',
    ]);
    expect(sections[0]).toMatchObject({ kind: 'text', label: 'Archetype', text: 'Lurker' });
    const series = sections[1];
    expect(series).toMatchObject({ kind: 'table', columns: ['Month', 'Statuses', 'Followers'] });
    if (series.kind !== 'table') throw new Error('table');
    expect(series.rows[0][0]).toEqual({ kind: 'text', text: 'January' });
    expect(series.rows[1][1]).toEqual({ kind: 'text', text: '1,200', numeric: true });
    const people = sections[2];
    if (people.kind !== 'table') throw new Error('table');
    expect(people.columns[0]).toBe('Account');
    expect(people.rows[0][0]).toEqual({ kind: 'account', account: alice });
    expect(people.rows[1][0]).toEqual({ kind: 'missing-account' });
    expect(sections[3]).toEqual({
      kind: 'statuses',
      key: 'top_statuses',
      label: 'Top statuses',
      items: [{ label: 'By reblogs', status: post }],
    });
    expect(sections[4]).toMatchObject({
      kind: 'pairs',
      rows: [
        { label: 'Total', value: '10' },
        { label: 'Replies', value: '4' },
      ],
    });
  });

  it('handles camelCase keys and an empty report', () => {
    expect(humanize('mostRebloggedAccounts')).toBe('Most reblogged accounts');
    expect(reportSections(null, [], [])).toEqual([]);
  });
});
