import { accountScopeSuffix, scopedKey } from '../../platform/session/account-scope';

/**
 * Account setup progress: the full-page wizard for a Mastodon account that is
 * minutes old (spec/new-account-setup.md).
 *
 * Like `onboarding-store.ts`, this is the only setup module the always-loaded
 * code touches: `Auth` arms it when a brand-new account verifies, and the shell
 * sends an armed account from Home to `/setup`. Everything else is lazy.
 *
 * The storage registry marks this account's progress and answers as private,
 * which keeps them out of settings exports. The intro step saves draft text
 * separately through Drafts.
 */
export const ACCOUNT_SETUP_KEY = 'mockingbird_account_setup';

const VERSION = 1;

/**
 * Two days, at date precision. Mastodon is believed to truncate `created_at` to
 * midnight UTC (unverified, see the spec's canary list), so an account made
 * late yesterday can read as "yesterday 00:00". Two days covers that.
 */
const YOUNG_ACCOUNT_MS = 2 * 24 * 60 * 60 * 1000;

/** How setup was armed: a sign-up that came back, or a young empty account. */
export type SetupSource = 'signup' | 'young';

/** Where the person was headed before sign-up; `twitter` preselects the movers step. */
export type SetupHint = 'twitter';

export interface SetupRecord {
  version: typeof VERSION;
  /** `armed`: send them to setup. `running`: started. `finished`: reached Done. */
  state: 'armed' | 'running' | 'finished';
  source: SetupSource;
  /** Step ids that were Next'd or Skipped. */
  answered: string[];
  purpose?: SetupPurpose;
  /** Answer to "Were you on Twitter or Bluesky?". */
  movers?: SetupMovers;
  hint?: SetupHint;
}

export type SetupPurpose = 'me' | 'pseudonym' | 'project' | 'alt';
export type SetupMovers = 'twitter' | 'bluesky' | 'neither';
const PURPOSES: readonly string[] = ['me', 'pseudonym', 'project', 'alt'];
const MOVERS: readonly string[] = ['twitter', 'bluesky', 'neither'];

function parse(raw: string | null): SetupRecord | null {
  try {
    const value = JSON.parse(raw ?? 'null') as Record<string, unknown> | null;
    if (!value || typeof value !== 'object') return null;
    const state = value['state'];
    if (state !== 'armed' && state !== 'running' && state !== 'finished') return null;
    const answered = Array.isArray(value['answered'])
      ? value['answered'].filter((id): id is string => typeof id === 'string')
      : [];
    return {
      version: VERSION,
      state,
      source: value['source'] === 'young' ? 'young' : 'signup',
      answered,
      ...(PURPOSES.includes(value['purpose'] as string) && {
        purpose: value['purpose'] as SetupPurpose,
      }),
      ...(MOVERS.includes(value['movers'] as string) && {
        movers: value['movers'] as SetupMovers,
      }),
      ...(value['hint'] === 'twitter' && { hint: 'twitter' as const }),
    };
  } catch {
    return null;
  }
}

function write(key: string, record: SetupRecord): void {
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Setup is a convenience; a full or blocked store must not break sign-in.
  }
}

/** The active account's setup record, or null when setup never applied to it. */
export function readSetup(): SetupRecord | null {
  if (!accountScopeSuffix()) return null;
  try {
    return parse(localStorage.getItem(scopedKey(ACCOUNT_SETUP_KEY)));
  } catch {
    return null;
  }
}

export function writeSetup(record: SetupRecord): void {
  if (!accountScopeSuffix()) return;
  write(scopedKey(ACCOUNT_SETUP_KEY), record);
}

/**
 * Arm setup for an account. Takes an explicit scope suffix, like
 * `markOnboardingPending`, because the caller runs as the account is adopted.
 * A no-op when the account already has a record: setup is offered once.
 */
export function armSetup(scopeSuffix: string, source: SetupSource, hint?: SetupHint): void {
  if (!scopeSuffix) return;
  const key = `${ACCOUNT_SETUP_KEY}${scopeSuffix}`;
  try {
    if (localStorage.getItem(key) !== null) return;
  } catch {
    return;
  }
  write(key, { version: VERSION, state: 'armed', source, answered: [], ...(hint && { hint }) });
}

/**
 * True for an account that looks minutes old: created within the last two days,
 * no posts and following nobody. The fallback for sign-ups that did not come
 * back through `prompt=create` (older servers, joinmastodon.org, Native).
 */
export function isYoungEmptyAccount(
  account: { created_at?: string; statuses_count?: number; following_count?: number },
  now = Date.now(),
): boolean {
  if (account.statuses_count !== 0 || account.following_count !== 0) return false;
  const created = Date.parse(account.created_at ?? '');
  if (!Number.isFinite(created)) return false;
  return now - created <= YOUNG_ACCOUNT_MS && created <= now + YOUNG_ACCOUNT_MS;
}

/**
 * A sign-up that just came back through OAuth, noted by the login callback and
 * consumed by `Auth.setAccount` in the same page load. Module state rather than
 * storage on purpose: the callback, code exchange and verification all happen
 * before any reload, and a stale flag must not arm some later sign-in.
 */
let signupReturn: { hint?: SetupHint } | null = null;

export function noteSignupReturn(hint?: SetupHint): void {
  signupReturn = hint ? { hint } : {};
}

export function takeSignupReturn(): { hint?: SetupHint } | null {
  const value = signupReturn;
  signupReturn = null;
  return value;
}

/** Whether the active account should be sent to setup from `url`. */
export function setupRedirectFor(url: string): string | null {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '');
  if (path !== '/home' && path !== '') return null;
  return readSetup()?.state === 'armed' ? '/setup' : null;
}
