/**
 * Which credentials may enter the connection vault, and which may not.
 *
 * Both lists are exhaustive over `sensitivity: 'secret'` in
 * `storage-registry.ts`, and `vault-manifest.spec.ts` proves it in both
 * directions. That is the mechanism that makes "adding a key to the vault is a
 * deliberate act" true rather than aspirational: a new credential added to the
 * registry **fails the build** until somebody writes down which list it belongs
 * in and why.
 *
 * The registry stays the single inventory. This file is a decision layered on
 * top of it, not a second copy — every entry here names a `base` that must exist
 * there, and nothing here restates a key's sensitivity or storage.
 *
 * See `mawkingbird_profile/spec/secrets_roadmap.md` § 4.
 */

/** Who a vaulted credential belongs to, which decides where it sits in the bundle. */
export type VaultScope =
  /**
   * The human. One copy, shared by every persona in the browser. Sits at the top
   * level of the bundle.
   */
  | 'browser'
  /**
   * One persona. Sits under its account key inside the bundle — **inside the
   * encryption**, so the server never learns how many personas someone has or
   * what they are called.
   */
  | 'account';

export interface VaultedKey {
  /** The `base` from `storage-registry.ts`. Must match exactly. */
  base: string;
  scope: VaultScope;
  /** Which connector this belongs to, for the settings page. */
  connector: string;
  /** Why it is worth syncing — the part not obvious from the name. */
  note: string;
}

/**
 * The credentials that sync.
 *
 * The common thread: a long-lived string the user obtained **by hand** from a
 * provider, identical on every device, and tedious to re-obtain. That is what
 * makes re-pasting it on a phone a real cost worth carrying encryption to avoid.
 */
export const VAULTED_KEYS: readonly VaultedKey[] = [
  {
    base: 'mockingbird_openrouter_key',
    scope: 'browser',
    connector: 'openrouter',
    note: 'The one people actually want synced, and the one with a spending risk — see the uncapped-key warning in Sprint 4.',
  },
  {
    base: 'mockingbird_cors_proxy_key',
    scope: 'browser',
    connector: 'cors-proxy',
    note: 'A working proxy is a precondition for several other connectors, so syncing it removes a setup step from each of them.',
  },
  {
    base: 'mockingbird_shortener_keys',
    scope: 'browser',
    connector: 'link-shortener',
    note: 'A keyed map rather than one string: several vendors, one active. Exercises the per-key merge properly.',
  },
  {
    base: 'mockingbird_raindrop_token',
    scope: 'browser',
    connector: 'raindrop',
    note: 'A pasted test token. Belongs to the bookmark drawer, not to a persona.',
  },
  {
    base: 'mockingbird_twitter_keys',
    scope: 'browser',
    connector: 'twitter',
    note: 'Belongs to whoever pays for the API credits. Read-only, but a quota is money.',
  },
  {
    base: 'mockingbird_mataroa_connection',
    scope: 'account',
    connector: 'mataroa',
    note: 'An API key whose name says "connection" — the known miss in the server-side credential regex, and safe here because this path is encrypted by construction.',
  },
  {
    base: 'mockingbird_hugo_credentials',
    scope: 'account',
    connector: 'hugo',
    note: 'A GitHub token scoped to the blog repository. A blog belongs to one public persona.',
  },
  {
    base: 'mockingbird_github_credentials',
    scope: 'account',
    connector: 'github',
    note: 'Read-only account link. Same token shape as Hugo and Gist, so the three land together.',
  },
  {
    base: 'mockingbird_gist_credentials',
    scope: 'account',
    connector: 'gist',
    note: 'Gists belong to the account that owns them, not to the browser that made them.',
  },
  {
    base: 'mockingbird_bsky_credentials',
    scope: 'account',
    connector: 'bluesky',
    // Moved out of NOT_VAULTED, deliberately and against its stated reason.
    //
    // The old reason was "a Bluesky app password is re-issued in under a
    // minute — identity, not a purchase", filed beside the Mastodon session
    // tokens. Two things were wrong with it.
    //
    // First, the cost was measured once. Re-issuing is cheap; doing it on the
    // phone, the desktop, and the second browser, repeatedly, is not — and the
    // failure was loudest precisely for the user who had turned sync ON, saw
    // every other key arrive, and found Bluesky still asking.
    //
    // Second, and the real error: an app password is not identity. It is a
    // revocable, per-app credential the user went and obtained — the same shape
    // as every other key in this list, and nothing like a Mastodon OAuth token,
    // which IS the account and stays out. Bluesky offers no PKCE flow, so
    // there is no cheap re-auth to fall back on the way Mastodon has.
    //
    // The exposure argument also cut the other way once examined: the app
    // password already had to travel between devices somehow, and the channel
    // it travelled through (a password manager, a note, a message to oneself)
    // is weaker than this one. Vaulting it removes a hand-copied secret rather
    // than adding a synced one.
    note: 'A revocable per-app password the user obtained, not an identity token. Bluesky has no PKCE re-auth, so re-pasting on every device was the only alternative.',
  },
  {
    base: 'mockingbird_bsky_identity_credentials',
    // Unscoped in storage (the DID it would be scoped by lives inside it — see
    // bluesky-identity-store.ts), so it syncs as a browser-level credential.
    scope: 'browser',
    connector: 'bluesky',
    note: 'The same credential when Bluesky is the primary identity rather than a connector. Same reasoning as mockingbird_bsky_credentials.',
  },
];

/**
 * Every other `secret` key, with the reason it stays local.
 *
 * This list exists so the pin can be exhaustive. Without it, "not vaulted" and
 * "nobody has looked at this yet" are the same state, and a new credential could
 * reach production having never been considered.
 */
export const NOT_VAULTED: readonly { base: string; reason: string }[] = [
  {
    base: 'mastodon_mock_token',
    reason:
      'Identity, not a credential the user obtained. Signing in on a new device is the normal, cheap path and already works; syncing session tokens widens the worst-case theft for no real gain.',
  },
  {
    base: 'mastodon_mock_session_tokens',
    reason: 'Same as mastodon_mock_token, one per saved session.',
  },
  {
    base: 'mockingbird_raindrop_credentials',
    reason:
      'A dead key from the superseded Raindrop OAuth flow. `RaindropSession` deletes it on every construction and nothing writes it, so vaulting it would sync a credential the app is actively trying to forget — and would resurrect it on every device on the next read. The live Raindrop credential is mockingbird_raindrop_token.',
  },
  {
    base: 'mockingbird_mastodon_connector_token',
    reason: 'Identity. Re-authenticating is the expected path.',
  },
  {
    base: 'mockingbird_paste_edit_keys',
    reason:
      'Changes on every paste. Syncing it would mean a vault write per paste, which is churn the one-blob design is not shaped for. Revisit only if users ask.',
  },
  {
    base: 'mockingbird_pastepile_key',
    reason: 'Same churn problem as mockingbird_paste_edit_keys.',
  },
  {
    base: 'mastodon_mock_oauth_app',
    reason: 'sessionStorage. Lifetime measured in seconds and meaningless off-device.',
  },
  {
    base: 'mockingbird_openrouter_pkce_verifier',
    reason: 'sessionStorage, single-use, seconds long.',
  },
  {
    base: 'mockingbird_dropbox_token',
    reason:
      'The Dropbox connector deliberately does not persist its token — it is session-scoped by design, and syncing it would undo that decision.',
  },
  {
    base: 'mockingbird_dropbox_pkce_verifier',
    reason: 'sessionStorage, single-use.',
  },
  {
    base: 'mockingbird_dropbox_oauth_state',
    reason: 'sessionStorage, single-use.',
  },
  {
    base: 'mockingbird_openrouter_oauth_state',
    reason:
      'sessionStorage. Anti-CSRF state for one in-flight authorization, dead the moment it completes.',
  },
  {
    base: 'mockingbird_blogger_token',
    reason:
      'A short-lived Google access token in sessionStorage. Blogger signs in with OAuth rather than a pasted key, so there is nothing long-lived to spare the user re-entering — which is the entire justification for vaulting anything.',
  },
  {
    base: 'mockingbird_blogger_pkce_verifier',
    reason: 'sessionStorage, single-use.',
  },
  {
    base: 'mockingbird_blogger_oauth_state',
    reason: 'sessionStorage, single-use.',
  },
];

/** Lookup by registry base, or undefined when the key does not sync. */
export function vaultedKey(base: string): VaultedKey | undefined {
  return VAULTED_KEYS.find((entry) => entry.base === base);
}

/** Whether a key syncs. */
export function isVaulted(base: string): boolean {
  return vaultedKey(base) !== undefined;
}

/** The decrypted bundle, as stored. */
export interface ConnectionBundle {
  /** Bundle schema version, for future converters. */
  v: 1;
  /** `browser`-scoped credentials, by registry base. */
  browser: Record<string, string>;
  /** `account`-scoped credentials, by account key then registry base. */
  accounts: Record<string, Record<string, string>>;
  /**
   * When each credential was added, and from where.
   *
   * Inside the encryption like everything else. It exists so the settings page
   * can say "added from desktop, three months ago" and so a same-key conflict
   * can be resolved by recency and explained by device — see
   * {@link mergeBundles}.
   */
  meta: Record<string, { addedAt: string; device: string }>;
}

export function emptyBundle(): ConnectionBundle {
  return { v: 1, browser: {}, accounts: {}, meta: {} };
}

/** Whether a decrypted value is shaped like a bundle. */
export function isBundle(value: unknown): value is ConnectionBundle {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<ConnectionBundle>;
  return (
    candidate.v === 1 &&
    typeof candidate.browser === 'object' &&
    candidate.browser !== null &&
    typeof candidate.accounts === 'object' &&
    candidate.accounts !== null
  );
}

/** A key's address inside a bundle. `null` account means browser scope. */
function metaKeyFor(base: string, accountKey: string | null): string {
  return accountKey === null ? base : `${accountKey} ${base}`;
}

/** What changed when two bundles were merged, for telling the user. */
export interface MergeReport {
  bundle: ConnectionBundle;
  /** Keys where the remote copy won because it was newer. */
  overwritten: { base: string; device: string }[];
}

/**
 * Combine a local bundle with the one already on the server.
 *
 * **Per credential, not whole-blob last-write-wins.** The realistic conflict is
 * "the desktop added a shortener key while the phone added a Mataroa key", and a
 * per-key union loses neither. Taking the whole newer blob would silently
 * discard one of them, and the user would find a connector disconnected with no
 * explanation.
 *
 * Genuine same-key conflicts — the same credential set to different values on
 * two devices — take the newer `addedAt` and are **reported**, so the UI can say
 * which device won. Resolving that silently is how someone spends an afternoon
 * wondering why the key they just pasted does not work.
 */
export function mergeBundles(mine: ConnectionBundle, theirs: ConnectionBundle): MergeReport {
  const merged = emptyBundle();
  const overwritten: MergeReport['overwritten'] = [];

  const resolve = (base: string, accountKey: string | null, ours?: string, remote?: string) => {
    const id = metaKeyFor(base, accountKey);
    const ourMeta = mine.meta?.[id];
    const theirMeta = theirs.meta?.[id];

    if (ours === undefined) {
      return { value: remote, meta: theirMeta };
    }
    if (remote === undefined || ours === remote) {
      return { value: ours, meta: ourMeta ?? theirMeta };
    }

    // Both present and different. Recency decides, and the loser is named.
    const ourTime = Date.parse(ourMeta?.addedAt ?? '');
    const theirTime = Date.parse(theirMeta?.addedAt ?? '');
    // An unparseable local timestamp yields NaN, and NaN comparisons are false,
    // so this keeps ours — the conservative direction, since the local copy is
    // the one the user can see in front of them.
    if (Number.isFinite(theirTime) && !(ourTime >= theirTime)) {
      overwritten.push({ base, device: theirMeta?.device ?? 'another device' });
      return { value: remote, meta: theirMeta };
    }
    return { value: ours, meta: ourMeta };
  };

  const bases = new Set([...Object.keys(mine.browser), ...Object.keys(theirs.browser)]);
  for (const base of bases) {
    const { value, meta } = resolve(base, null, mine.browser[base], theirs.browser[base]);
    if (value !== undefined) {
      merged.browser[base] = value;
      if (meta) {
        merged.meta[metaKeyFor(base, null)] = meta;
      }
    }
  }

  const accountKeys = new Set([...Object.keys(mine.accounts), ...Object.keys(theirs.accounts)]);
  for (const accountKey of accountKeys) {
    const ourAccount = mine.accounts[accountKey] ?? {};
    const theirAccount = theirs.accounts[accountKey] ?? {};
    const accountBases = new Set([...Object.keys(ourAccount), ...Object.keys(theirAccount)]);
    for (const base of accountBases) {
      const { value, meta } = resolve(base, accountKey, ourAccount[base], theirAccount[base]);
      if (value !== undefined) {
        merged.accounts[accountKey] ??= {};
        merged.accounts[accountKey][base] = value;
        if (meta) {
          merged.meta[metaKeyFor(base, accountKey)] = meta;
        }
      }
    }
  }

  return { bundle: merged, overwritten };
}

/** Read one credential out of a bundle. */
export function readFromBundle(
  bundle: ConnectionBundle,
  base: string,
  accountKey: string | null,
): string | null {
  if (accountKey === null) {
    return bundle.browser[base] ?? null;
  }
  return bundle.accounts[accountKey]?.[base] ?? null;
}

/** Write one credential into a bundle, stamping when and from where. */
export function writeToBundle(
  bundle: ConnectionBundle,
  base: string,
  accountKey: string | null,
  value: string,
  device: string,
  now: Date = new Date(),
): ConnectionBundle {
  const next: ConnectionBundle = {
    v: 1,
    browser: { ...bundle.browser },
    accounts: Object.fromEntries(
      Object.entries(bundle.accounts).map(([key, values]) => [key, { ...values }]),
    ),
    meta: { ...bundle.meta },
  };
  if (accountKey === null) {
    next.browser[base] = value;
  } else {
    next.accounts[accountKey] = { ...(next.accounts[accountKey] ?? {}), [base]: value };
  }
  next.meta[metaKeyFor(base, accountKey)] = { addedAt: now.toISOString(), device };
  return next;
}

/** Remove one credential from a bundle. */
export function removeFromBundle(
  bundle: ConnectionBundle,
  base: string,
  accountKey: string | null,
): ConnectionBundle {
  const next: ConnectionBundle = {
    v: 1,
    browser: { ...bundle.browser },
    accounts: Object.fromEntries(
      Object.entries(bundle.accounts).map(([key, values]) => [key, { ...values }]),
    ),
    meta: { ...bundle.meta },
  };
  if (accountKey === null) {
    delete next.browser[base];
  } else if (next.accounts[accountKey]) {
    delete next.accounts[accountKey][base];
    if (Object.keys(next.accounts[accountKey]).length === 0) {
      delete next.accounts[accountKey];
    }
  }
  delete next.meta[metaKeyFor(base, accountKey)];
  return next;
}

/** How many credentials a bundle holds. For the settings page. */
export function bundleCount(bundle: ConnectionBundle): number {
  return (
    Object.keys(bundle.browser).length +
    Object.values(bundle.accounts).reduce((total, values) => total + Object.keys(values).length, 0)
  );
}
