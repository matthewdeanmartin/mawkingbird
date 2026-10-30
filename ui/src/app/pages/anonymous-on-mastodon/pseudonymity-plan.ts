import { Account, AccountField } from '../../models';

/**
 * Which of a Mastodon account's own settings point towards pseudonymity, and
 * which of them this account's server actually has.
 *
 * Only settings `update_credentials` can write are switches here. A server
 * that predates a setting simply ignores it in an update, so a switch is
 * offered only when the account entity reports the field at all; otherwise
 * the page would claim to have changed something the server never had.
 */

export type ServerSwitchKey = 'discoverable' | 'indexable' | 'hide_collections' | 'locked';

export interface ServerSwitch {
  key: ServerSwitchKey;
  /** The value that favours pseudonymity. */
  want: boolean;
  /** Ticked by default when not already set. `locked` costs reach, so it is opt-in. */
  recommended: boolean;
  label: string;
  why: string;
}

export const SERVER_SWITCHES: readonly ServerSwitch[] = [
  {
    key: 'hide_collections',
    want: true,
    recommended: true,
    label: 'Hide who you follow and who follows you',
    why: 'The people around an account are often the quickest way to work out who runs it.',
  },
  {
    key: 'discoverable',
    want: false,
    recommended: true,
    label: 'Leave the profile directory and follow suggestions',
    why: 'Your profile stops being recommended to strangers and listed in the directory.',
  },
  {
    key: 'indexable',
    want: false,
    recommended: true,
    label: 'Keep your posts out of full-text search',
    why: 'People cannot find your public posts by searching for words in them. Hashtags still work.',
  },
  {
    key: 'locked',
    want: true,
    recommended: false,
    label: 'Approve every new follower yourself (optional)',
    why: 'Followers-only posts reach only people you let in. It also slows down who can follow you.',
  },
];

/** The switches this account's server knows about. */
export function offeredSwitches(account: Account): ServerSwitch[] {
  return SERVER_SWITCHES.filter((entry) => account[entry.key] !== undefined);
}

export function isSet(account: Account, entry: ServerSwitch): boolean {
  return account[entry.key] === entry.want;
}

/** What is ticked to start with: recommended switches that are not set yet. */
export function initialSelection(account: Account): Set<ServerSwitchKey> {
  return new Set(
    offeredSwitches(account)
      .filter((entry) => entry.recommended && !isSet(account, entry))
      .map((entry) => entry.key),
  );
}

/**
 * Profile fields that can tie the account to a real identity: links the server
 * verified (the other site links back) and any field holding a web address.
 * The page can only point these out; editing them is the person's call.
 */
export function revealingFields(account: Account): AccountField[] {
  // The rendered fields carry `verified_at`; the editable `source` copy does not.
  const fields = account.fields?.length ? account.fields : (account.source?.fields ?? []);
  return fields.filter((field) => !!field.verified_at || /https?:\/\/|<a\s/i.test(field.value));
}

/** Plain text of a field value, which Mastodon may return as HTML. */
export function fieldText(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}
