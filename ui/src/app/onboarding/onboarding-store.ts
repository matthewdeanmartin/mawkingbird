import { accountScopeSuffix, scopedKey } from '../account-scope';

/**
 * Onboarding progress: which wizard cards have been asked, never the answers.
 *
 * Deliberately tiny and free of Angular, because it is the one part of the
 * wizard the always-loaded code touches: `Auth` and `BlueskySession` mark a
 * brand-new account as pending, and the shell asks whether to open the card.
 * Everything else — the questions, the card, the controls — loads on demand.
 *
 * Two records:
 *
 * - **App-wide** (`mockingbird_onboarding_app`): questions about the person,
 *   asked once per browser whichever account asks them.
 * - **Per account** (`mockingbird_onboarding_account` + scope): questions about
 *   one identity, plus the `pending` flag that auto-starts the wizard.
 *
 * The answers themselves already live in their own settings keys, so neither
 * record carries anything personal.
 */
export const ONBOARDING_APP_KEY = 'mockingbird_onboarding_app';
export const ONBOARDING_ACCOUNT_KEY = 'mockingbird_onboarding_account';

const VERSION = 1;

export interface OnboardingAppRecord {
  version: typeof VERSION;
  answered: string[];
  /** Past the last app-wide card once; later accounts skip the whole section. */
  completed: boolean;
}

export interface OnboardingAccountRecord {
  version: typeof VERSION;
  /** Auto-start the next time this account reaches Home. */
  pending: boolean;
  answered: string[];
  finished: boolean;
}

function parse(raw: string | null): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function accountFrom(raw: string | null): OnboardingAccountRecord | null {
  const value = parse(raw);
  if (!value) return null;
  return {
    version: VERSION,
    pending: value['pending'] === true,
    answered: ids(value['answered']),
    finished: value['finished'] === true,
  };
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Progress is a convenience. A full or blocked store must not break the card.
  }
}

export function readOnboardingApp(): OnboardingAppRecord {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(ONBOARDING_APP_KEY);
  } catch {
    // Treated as a fresh browser.
  }
  const value = parse(raw);
  return {
    version: VERSION,
    answered: ids(value?.['answered']),
    completed: value?.['completed'] === true,
  };
}

export function writeOnboardingApp(record: OnboardingAppRecord): void {
  write(ONBOARDING_APP_KEY, record);
}

/** The active account's record, or null when it has never been onboarded. */
export function readOnboardingAccount(): OnboardingAccountRecord | null {
  try {
    return accountFrom(localStorage.getItem(scopedKey(ONBOARDING_ACCOUNT_KEY)));
  } catch {
    return null;
  }
}

export function writeOnboardingAccount(record: OnboardingAccountRecord): void {
  // Signed out there is no account to file it under.
  if (!accountScopeSuffix()) return;
  write(scopedKey(ONBOARDING_ACCOUNT_KEY), record);
}

export function emptyOnboardingAccount(): OnboardingAccountRecord {
  return { version: VERSION, pending: false, answered: [], finished: false };
}

/**
 * Mark an account as new to this browser, so the wizard opens on its first Home.
 *
 * Takes an explicit scope suffix rather than reading the active one: the login
 * paths call this before the new account is necessarily the active scope.
 *
 * A no-op when the account already has a record. Someone who has seen the
 * wizard, or quit it, is never re-armed by signing in again.
 */
export function markOnboardingPending(scopeSuffix: string): void {
  if (!scopeSuffix) return;
  const key = `${ONBOARDING_ACCOUNT_KEY}${scopeSuffix}`;
  try {
    if (localStorage.getItem(key) !== null) return;
  } catch {
    return;
  }
  write(key, { ...emptyOnboardingAccount(), pending: true });
}
