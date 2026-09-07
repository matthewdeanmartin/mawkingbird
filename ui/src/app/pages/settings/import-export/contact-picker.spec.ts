import { describe, expect, it, vi } from 'vitest';
import { contactPickerAvailable, MAX_PICKED_CONTACTS, pickContacts } from './contact-picker';
import { rankMatch } from './contact-discovery';
import { Account } from '../../../models';

/**
 * Reading contacts from the phone's address book.
 *
 * `navigator.contacts` does not exist in jsdom, so every test here stubs the
 * manager and exercises what happens downstream of it. What cannot be tested
 * here is the picker sheet itself — that needs Chrome on a real Android device.
 */

/** A Navigator carrying a stub ContactsManager, shaped like the real one. */
function navigatorWith(
  select: (properties: string[], options?: { multiple?: boolean }) => Promise<unknown[]>,
  supported?: string[],
): Navigator {
  // `contactPickerAvailable` checks the global for ContactsManager, which jsdom
  // has never heard of.
  (window as unknown as Record<string, unknown>)['ContactsManager'] = class {};
  return {
    contacts: {
      select,
      ...(supported ? { getProperties: () => Promise.resolve(supported) } : {}),
    },
  } as unknown as Navigator;
}

function account(over: Partial<Account> = {}): Account {
  return {
    id: '1',
    username: 'ffling',
    acct: 'ffling@mastodon.social',
    display_name: 'Freedbling Flingerblam',
    note: '',
    url: 'https://mastodon.social/@ffling',
    avatar: '',
    avatar_static: '',
    header: '',
    header_static: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    discoverable: true,
    fields: [],
    ...over,
  } as Account;
}

describe('contactPickerAvailable', () => {
  it('is false in a browser with no ContactsManager', () => {
    delete (window as unknown as Record<string, unknown>)['ContactsManager'];
    expect(contactPickerAvailable({} as Navigator)).toBe(false);
  });

  it('is true when the API is present', () => {
    const nav = navigatorWith(() => Promise.resolve([]));
    expect(contactPickerAvailable(nav)).toBe(true);
  });
});

describe('pickContacts', () => {
  it('reports unsupported rather than throwing where the API is absent', async () => {
    delete (window as unknown as Record<string, unknown>)['ContactsManager'];
    expect(await pickContacts({} as Navigator)).toEqual({ kind: 'unsupported' });
  });

  it('turns a picked contact into something searchable', async () => {
    const nav = navigatorWith(() =>
      Promise.resolve([{ name: ['Freedbling Flingerblam'], email: ['ffling@example.com'] }]),
    );

    const outcome = await pickContacts(nav);

    expect(outcome.kind).toBe('picked');
    if (outcome.kind !== 'picked') return;
    const [contact] = outcome.result.contacts;
    expect(contact.firstName).toBe('Freedbling');
    expect(contact.lastName).toBe('Flingerblam');
    // A search per contact, capped at two, exactly as the CSV path builds them.
    expect(contact.queries.length).toBeGreaterThan(0);
    expect(contact.queries.length).toBeLessThanOrEqual(2);
  });

  it('takes the first and last word as the name, ignoring the middle', async () => {
    // The picker hands back whole display names, not split fields. `rankMatch`
    // compares first and last against a display name and a middle name never
    // participates, so splitting this way loses nothing.
    const nav = navigatorWith(() => Promise.resolve([{ name: ['Ada Bertha Lovelace'] }]));

    const outcome = await pickContacts(nav);

    if (outcome.kind !== 'picked') throw new Error('expected a pick');
    expect(outcome.result.contacts[0].firstName).toBe('Ada');
    expect(outcome.result.contacts[0].lastName).toBe('Lovelace');
  });

  it('skips a contact with only one name rather than searching for it', async () => {
    // "Mum" would be searched against every account on the server and return
    // noise, for one of the reader's API calls.
    const nav = navigatorWith(() =>
      Promise.resolve([{ name: ['Mum'] }, { name: ['Ada Lovelace'] }]),
    );

    const outcome = await pickContacts(nav);

    if (outcome.kind !== 'picked') throw new Error('expected a pick');
    expect(outcome.result.contacts).toHaveLength(1);
    expect(outcome.result.total).toBe(2);
    expect(outcome.result.skipped).toBe(1);
  });

  it('prefers a fediverse handle written in the contact over the name', async () => {
    // A handle is proof; a name is a guess. Someone who saved their friend's
    // @user@host should be found by it.
    const nav = navigatorWith(() =>
      Promise.resolve([{ name: ['Ada Lovelace'], email: ['@ada@mastodon.social'] }]),
    );

    const outcome = await pickContacts(nav);

    if (outcome.kind !== 'picked') throw new Error('expected a pick');
    const contact = outcome.result.contacts[0];
    expect(contact.handles).toContain('ada@mastodon.social');
    expect(contact.queries[0].resolve).toBe(true);
  });

  it('caps how many contacts one run will search for', async () => {
    const many = Array.from({ length: MAX_PICKED_CONTACTS + 5 }, (_, i) => ({
      name: [`Person${i} Surname${i}`],
    }));
    const nav = navigatorWith(() => Promise.resolve(many));

    const outcome = await pickContacts(nav);

    if (outcome.kind !== 'picked') throw new Error('expected a pick');
    expect(outcome.result.contacts).toHaveLength(MAX_PICKED_CONTACTS);
    // The overflow is reported rather than silently dropped: "I picked 25 and it
    // searched 20" needs an answer on screen.
    expect(outcome.result.total).toBe(MAX_PICKED_CONTACTS + 5);
    expect(outcome.result.skipped).toBe(5);
  });

  it('treats an empty selection as a cancellation', async () => {
    const nav = navigatorWith(() => Promise.resolve([]));
    expect((await pickContacts(nav)).kind).toBe('cancelled');
  });

  it('reports a refused picker in words rather than throwing', async () => {
    const nav = navigatorWith(() =>
      Promise.reject(Object.assign(new Error('no'), { name: 'SecurityError' })),
    );

    const outcome = await pickContacts(nav);

    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.message).toContain('secure connection');
  });

  it('only asks for properties the device supports', async () => {
    const select = vi.fn().mockResolvedValue([{ name: ['Ada Lovelace'] }]);
    const nav = navigatorWith(select, ['name', 'tel']);

    await pickContacts(nav);

    // Asking for a property the device does not have throws and takes the whole
    // picker with it, so `email` must not be requested here.
    expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: true });
  });

  it('gives up when the device cannot supply names at all', async () => {
    // Email and phone are useless alone: Mastodon has no lookup for either
    // outside the admin API.
    const nav = navigatorWith(() => Promise.resolve([]), ['tel']);
    expect((await pickContacts(nav)).kind).toBe('unsupported');
  });
});

describe('picked contacts, end to end through the ranker', () => {
  it('finds a distinctive name and explains why', async () => {
    const nav = navigatorWith(() => Promise.resolve([{ name: ['Freedbling Flingerblam'] }]));
    const outcome = await pickContacts(nav);
    if (outcome.kind !== 'picked') throw new Error('expected a pick');

    const match = rankMatch(outcome.result.contacts[0], account());

    expect(match.signals).toContain('Display name exactly matches');
  });

  it('gives a common name no confidence on the name alone', async () => {
    // The John Doe case, stated as a test. One weak signal is still shown — the
    // reader decides — but it is never dressed up as a likely match, and
    // nothing is followed without their click.
    const nav = navigatorWith(() => Promise.resolve([{ name: ['John Doe'] }]));
    const outcome = await pickContacts(nav);
    if (outcome.kind !== 'picked') throw new Error('expected a pick');

    const match = rankMatch(
      outcome.result.contacts[0],
      account({ display_name: 'John Doe', acct: 'jd@example.social', username: 'jd' }),
    );

    expect(match.confidence).toBe('weak');
  });
});
