/**
 * What a Mastodon server offers someone who has no account yet, from its public
 * `GET /api/v2/instance`.
 *
 * The question that matters is whether sign-up can come back to us. Since
 * Mastodon 5.0 the OAuth authorize endpoint takes `prompt=create`: the server
 * shows its own sign-up form, then continues the authorization and redirects
 * back with a code, so a brand-new user lands signed in instead of being asked
 * to bookmark this page and return. Older servers ignore the parameter, so the
 * login page keeps the welcome-back page as their path.
 *
 * Plain `fetch`, like `handle-availability.ts`: a stranger's server, no token,
 * no app interceptors.
 */

export interface SignupSupport {
  /** Sign-up then return, via `prompt=create`. */
  createPrompt: boolean;
  /** Open, approval-required, or closed to new accounts; null when unknown. */
  registrations: 'open' | 'approval' | 'closed' | null;
  version: string | null;
}

const TIMEOUT_MS = 6000;

/** True for Mastodon 5.0 and later, including forks that keep the version prefix. */
export function supportsCreatePrompt(version: string | null | undefined): boolean {
  const major = Number(/^(\d+)\./.exec(version ?? '')?.[1]);
  return Number.isFinite(major) && major >= 5;
}

export function registrationState(
  registrations: { enabled?: unknown; approval_required?: unknown } | undefined,
): SignupSupport['registrations'] {
  if (!registrations || typeof registrations.enabled !== 'boolean') return null;
  if (!registrations.enabled) return 'closed';
  return registrations.approval_required === true ? 'approval' : 'open';
}

export async function probeSignup(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SignupSupport> {
  const unknown: SignupSupport = { createPrompt: false, registrations: null, version: null };
  if (!/^https:\/\//.test(baseUrl)) return unknown;
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/v2/instance`, {
      credentials: 'omit',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return unknown;
    const body = (await response.json()) as {
      version?: unknown;
      registrations?: { enabled?: unknown; approval_required?: unknown };
    };
    const version = typeof body.version === 'string' ? body.version : null;
    return {
      createPrompt: supportsCreatePrompt(version),
      registrations: registrationState(body.registrations),
      version,
    };
  } catch {
    return unknown;
  }
}
