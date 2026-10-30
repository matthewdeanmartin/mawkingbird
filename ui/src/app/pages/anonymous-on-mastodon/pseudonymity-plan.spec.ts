import { describe, expect, it } from 'vitest';
import { Account } from '../../models';
import { fieldText, initialSelection, offeredSwitches, revealingFields } from './pseudonymity-plan';

function account(overrides: Partial<Account>): Account {
  return {
    id: '1',
    username: 'me',
    acct: 'me',
    display_name: '',
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...overrides,
  } as Account;
}

describe('pseudonymity plan', () => {
  it('offers only the switches the server reports, so none is silently ignored', () => {
    const old = account({ discoverable: true });
    expect(offeredSwitches(old).map((entry) => entry.key)).toEqual(['discoverable', 'locked']);
    const current = account({ discoverable: true, indexable: true, hide_collections: false });
    expect(offeredSwitches(current).map((entry) => entry.key)).toEqual([
      'hide_collections',
      'discoverable',
      'indexable',
      'locked',
    ]);
  });

  it('pre-ticks the recommended switches that are not set, and never locking', () => {
    const fresh = account({ discoverable: true, indexable: true, hide_collections: false });
    expect([...initialSelection(fresh)].sort()).toEqual([
      'discoverable',
      'hide_collections',
      'indexable',
    ]);
    const half = account({ discoverable: false, indexable: true, hide_collections: true });
    expect([...initialSelection(half)]).toEqual(['indexable']);
  });

  it('treats an unset (null) discoverable as something to change', () => {
    expect(initialSelection(account({ discoverable: null })).has('discoverable')).toBe(true);
  });

  it('points out verified links and any field holding a web address', () => {
    const fields = revealingFields(
      account({
        fields: [
          { name: 'Pronouns', value: 'they/them' },
          {
            name: 'Site',
            value: '<a href="https://me.example">me.example</a>',
            verified_at: '2026-01-01',
          },
          { name: 'Code', value: 'https://git.example/me' },
        ],
      }),
    );
    expect(fields.map((field) => field.name)).toEqual(['Site', 'Code']);
    expect(fieldText(fields[0].value)).toBe('me.example');
  });
});
