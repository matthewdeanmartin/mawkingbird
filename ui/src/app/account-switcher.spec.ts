import { describe, expect, it } from 'vitest';
import { accountChoiceHost, accountLabel, filterAccountChoices } from './account-switcher';
import { AccountChoice } from './auth';

function choice(
  key: string,
  server: string,
  account: Partial<NonNullable<AccountChoice['account']>> | null,
): AccountChoice {
  return { key, kind: 'mastodon', token: key, server, account: account as never };
}

const choices = [
  choice('a', 'https://mastodon.social', {
    display_name: 'Matthew Martin',
    username: 'mistersql',
    acct: 'mistersql',
    url: 'https://mastodon.social/@mistersql',
  }),
  choice('b', 'https://hachyderm.io/', {
    display_name: 'Matthew Martin',
    username: 'vegdevops',
    acct: 'vegdevops',
    url: 'https://hachyderm.io/@vegdevops',
  }),
  choice('c', '', { display_name: 'janmato', username: 'janmato', acct: 'janmato', url: '' }),
  { key: 'anonymous', kind: 'anonymous', token: null, server: '', account: null } as AccountChoice,
];

describe('filterAccountChoices', () => {
  it('keeps everything for a blank query', () => {
    expect(filterAccountChoices(choices, '   ')).toHaveLength(choices.length);
  });

  it('matches handles with or without the leading @, ignoring case', () => {
    expect(filterAccountChoices(choices, '@VEGDEV').map((c) => c.key)).toEqual(['b']);
  });

  it('matches the server host', () => {
    expect(filterAccountChoices(choices, 'hachyderm').map((c) => c.key)).toEqual(['b']);
  });

  it('requires every word, across fields', () => {
    expect(filterAccountChoices(choices, 'matthew social').map((c) => c.key)).toEqual(['a']);
  });

  it('matches the anonymous choice by kind', () => {
    expect(filterAccountChoices(choices, 'anon').map((c) => c.key)).toEqual(['anonymous']);
  });
});

describe('account labels', () => {
  it('strips the scheme and trailing slash from the host', () => {
    expect(accountChoiceHost(choices[1])).toBe('hachyderm.io');
    expect(accountChoiceHost(choices[2])).toBe('');
  });

  it('falls back to the qualified handle without a display name', () => {
    expect(
      accountLabel({ display_name: ' ', acct: 'x', url: 'https://a.example/@x' } as never),
    ).toBe('@x@a.example');
    expect(accountLabel(null)).toBe('');
  });
});
