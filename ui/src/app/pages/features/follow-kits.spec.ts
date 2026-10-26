import { describe, expect, it } from 'vitest';
import { BundledStarterKit } from '../../bundled-starter-kits.generated';
import { Account } from '../../models';
import {
  MIN_PUBLIC_KIT_SIZE,
  PUBLIC_KITS,
  plainBio,
  publicKit,
  searchListable,
  toPublicKits,
} from './follow-kits';

function person(username: string, consent: Partial<Account> = {}): Account {
  return {
    id: username,
    username,
    acct: `${username}@example.social`,
    display_name: username.toUpperCase(),
    note: `<p>${username} posts about things &amp; stuff.</p>`,
    url: `https://example.social/@${username}`,
    avatar: `https://example.social/${username}.png`,
    avatar_static: '',
    header: '',
    header_static: '',
    followers_count: 1200,
    following_count: 10,
    statuses_count: 10,
    bot: false,
    locked: false,
    fields: [],
    discoverable: true,
    indexable: true,
    noindex: false,
    ...consent,
  };
}

function kit(slug: string, accounts: Account[]): BundledStarterKit {
  return { slug, title: 'Synthetic', blurb: 'A test kit.', accounts };
}

describe('public starter-kit pages', () => {
  it.each([
    [{ noindex: true }],
    [{ indexable: false }],
    [{ discoverable: false }],
    [{ discoverable: null }],
    [{ discoverable: undefined }],
  ])('leaves out an account that has not consented to search listing: %o', (consent) => {
    expect(searchListable(person('quiet', consent))).toBe(false);
  });

  it('lists an account that is discoverable and has not opted out of indexing', () => {
    expect(searchListable(person('open', { indexable: null, noindex: null }))).toBe(true);
  });

  it('omits opted-out people from a published kit', () => {
    const [published] = toPublicKits([
      kit('mixed', [person('a'), person('b'), person('c'), person('quiet', { noindex: true })]),
    ]);
    expect(published.accounts.map((account) => account.handle)).toEqual([
      '@a@example.social',
      '@b@example.social',
      '@c@example.social',
    ]);
    expect(published.heading).toBe('Synthetic on Mastodon: 3 accounts to follow');
  });

  it('publishes no page for a kit that consent filtering leaves too small', () => {
    const accounts = Array.from({ length: MIN_PUBLIC_KIT_SIZE }, (_, i) =>
      person(`p${i}`, i === 0 ? { indexable: false } : {}),
    );
    expect(toPublicKits([kit('small', accounts)])).toEqual([]);
  });

  it('turns profile HTML into a short plain-text bio', () => {
    expect(plainBio('<p>Hello &amp; welcome<br />to &#8220;my&#x201D; page</p><p>Two</p>')).toBe(
      'Hello & welcome to “my” page Two',
    );
    const long = plainBio(`<p>${'word '.repeat(100)}</p>`, 50);
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long.endsWith('…')).toBe(true);
  });

  it('keeps search descriptions within the snippet length', () => {
    const [published] = toPublicKits([
      { ...kit('long', [person('a'), person('b'), person('c')]), blurb: 'word '.repeat(200) },
    ]);
    expect(published.description.length).toBeLessThanOrEqual(160);
  });

  it('publishes every bundled kit today, each with only consenting people', () => {
    expect(PUBLIC_KITS.length).toBeGreaterThan(0);
    expect(new Set(PUBLIC_KITS.map((k) => k.slug)).size).toBe(PUBLIC_KITS.length);
    for (const published of PUBLIC_KITS) {
      expect(published.accounts.length).toBeGreaterThanOrEqual(MIN_PUBLIC_KIT_SIZE);
      expect(publicKit(published.slug)).toBe(published);
    }
    expect(publicKit('no-such-kit')).toBeNull();
  });
});
