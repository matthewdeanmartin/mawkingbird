import { qualifiedHandle } from './account-handle';
import { AccountChoice } from './auth';
import { Account } from './models';

/**
 * Switches the active identity.
 *
 * The shell owns the real implementation (its reload, connecting overlay and
 * rejected-token dialog all live in its template) and provides itself under
 * this token, so a routed page such as the full account picker can switch
 * accounts without importing the shell.
 */
export abstract class AccountSwitcher {
  abstract switchTo(target: AccountChoice): void;
}

/** Above this many saved choices the account menu offers a filter and the full picker. */
export const ACCOUNT_FILTER_THRESHOLD = 6;

/** Display name, falling back to the qualified handle. */
export function accountLabel(account: Account | null): string {
  if (!account) return '';
  const name = account.display_name?.trim();
  if (name) return name;
  const handle = qualifiedHandle(account) || account.acct?.trim() || account.username?.trim();
  return handle ? `@${handle.replace(/^@/, '')}` : '';
}

/** The instance host a choice belongs to, without the scheme ("" for this server). */
export function accountChoiceHost(choice: AccountChoice): string {
  return choice.server.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/**
 * Case-insensitive match on display name, username, acct and server host.
 *
 * Every whitespace-separated word must appear somewhere, so "matt social"
 * finds a Matt on mastodon.social. A blank query keeps everything.
 */
export function filterAccountChoices(
  choices: readonly AccountChoice[],
  query: string,
): AccountChoice[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...choices];
  return choices.filter((choice) => {
    const a = choice.account;
    const haystack = [
      a?.display_name,
      a?.username,
      a?.acct,
      a ? qualifiedHandle(a) : '',
      accountChoiceHost(choice),
      choice.kind,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word.replace(/^@/, '')));
  });
}
