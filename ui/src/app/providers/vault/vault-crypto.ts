/**
 * The inner wrap: the half of the connection vault that actually protects
 * anything.
 *
 * The server holds an outer wrap it can open, and a second wrap it cannot. This
 * module is the second one. The passphrase never leaves this file — not to the
 * network, not to `localStorage`, not as a hash, not as a verifier. A server
 * that could check a passphrase would be an oracle for an offline attack, which
 * is precisely what the design refuses to build.
 *
 * See `mawkingbird_profile/spec/secrets_roadmap.md` § 3 and
 * `secrets_sprint_3.md`.
 *
 * ## Why PBKDF2 and not Argon2id
 *
 * The spec prefers Argon2id and names PBKDF2 as the fallback. PBKDF2 ships
 * first, deliberately:
 *
 * - WebCrypto has no Argon2, so it means a WASM dependency. This app's
 *   `package.json` currently lists eleven runtime dependencies, none of them
 *   polyfills, and adding a crypto library is a decision that deserves its own
 *   conversation rather than arriving inside a sprint.
 * - PBKDF2-SHA-256 at 600,000 iterations is native, constant-time in the
 *   platform's implementation, and is what OWASP currently recommends for
 *   PBKDF2. It is weaker than Argon2id against custom hardware. It is not weak.
 * - **Nothing here forecloses the upgrade.** The KDF name and its parameters
 *   are recorded per vault in the server's metadata, and {@link deriveVaultKey}
 *   dispatches on what a vault says it used rather than on a constant. Adding
 *   Argon2id later is a new branch plus a new `CURRENT_KDF`; every existing
 *   vault keeps opening under PBKDF2 forever.
 *
 * That last property is the one worth protecting in review. A "simplification"
 * that reads `CURRENT_KDF` at unlock time instead of the vault's own record
 * would work perfectly until the day the default changes, and then lock every
 * existing user out of their own credentials.
 */

/** How a vault's key was derived. Stored server-side, in the clear. */
export interface KdfParams {
  name: string;
  params: Record<string, number>;
}

/**
 * PBKDF2 iteration count.
 *
 * 600,000, per OWASP's current PBKDF2-SHA-256 guidance. Costs roughly a quarter
 * second on a laptop and closer to a second on a slow phone — noticeable on a
 * screen that says "Unlocking", which is the right place to spend it.
 */
export const PBKDF2_ITERATIONS = 600_000;

/** What new vaults are created with. Existing vaults use whatever they recorded. */
export const CURRENT_KDF: KdfParams = {
  name: 'pbkdf2-sha256',
  params: { iterations: PBKDF2_ITERATIONS },
};

/** Salt length. 16 bytes is the usual floor and there is no reason to go under. */
const SALT_BYTES = 16;

/** AES-GCM's native IV size. See the note in the Worker's `vault-crypto.ts`. */
const IV_BYTES = 12;

/** Shortest passphrase the UI will accept. */
export const MIN_PASSPHRASE_LENGTH = 12;

/** A fresh salt for a new vault. Public by design — it is not a secret. */
export function generateSalt(): string {
  return bytesToBase64(
    crypto.getRandomValues(new Uint8Array<ArrayBuffer>(new ArrayBuffer(SALT_BYTES))),
  );
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: spreading a large array into `fromCharCode` blows the argument
  // limit, and it does so at the sizes where blobs get interesting rather than
  // in any test with a small fixture.
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/**
 * Decode base64 to bytes.
 *
 * The explicit `<ArrayBuffer>` matters: `new Uint8Array(n)` widens to
 * `ArrayBufferLike`, which includes `SharedArrayBuffer` and is therefore not
 * assignable to `BufferSource` under this project's strictness. Every value here
 * ends up as a WebCrypto argument, so the narrow type is the correct one rather
 * than a cast to silence a checker.
 */
export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array<ArrayBuffer>(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Derive the vault key from a passphrase.
 *
 * **The result is non-extractable.** Script running in this page can ask the
 * browser to decrypt with the key; it cannot read the key's bytes back out and
 * cannot ship them anywhere. That is what turns an XSS from "steal a key that
 * opens this vault from any machine, forever" into "read the vaulted keys on
 * this device during this session" — a real reduction, and not a fix. The threat
 * model says so plainly rather than claiming otherwise.
 *
 * `kdf` comes from the vault's own metadata, never from {@link CURRENT_KDF}. See
 * the module comment for why that distinction is load-bearing.
 */
export async function deriveVaultKey(
  passphrase: string,
  saltB64: string,
  kdf: KdfParams,
): Promise<CryptoKey> {
  if (kdf.name !== 'pbkdf2-sha256') {
    // Named rather than silently falling back. A vault written by a future
    // client using Argon2id must fail loudly on an old build, not be greeted
    // with a wrong key and an "incorrect passphrase" message that sends the user
    // hunting for a passphrase that was never wrong.
    throw new UnsupportedKdfError(kdf.name);
  }

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const iterations = kdf.params['iterations'];
  if (typeof iterations !== 'number' || !Number.isFinite(iterations) || iterations < 1) {
    throw new UnsupportedKdfError(`${kdf.name} with no usable iteration count`);
  }

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToBytes(saltB64), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    // Non-extractable. The whole point — see above.
    false,
    ['encrypt', 'decrypt'],
  );
}

/** A vault written under a KDF this build does not know how to run. */
export class UnsupportedKdfError extends Error {
  constructor(readonly kdfName: string) {
    super(
      `These stored connections were saved with a newer version of Mawkingbird (${kdfName}). Update the app to open them.`,
    );
    this.name = 'UnsupportedKdfError';
  }
}

/**
 * Encrypt a bundle for storage.
 *
 * A fresh random IV every time, prefixed to the ciphertext. Never a counter:
 * AES-GCM with a repeated IV under one key leaks the XOR of the plaintexts and
 * the authentication subkey, which is a total break rather than a weakness.
 */
export async function sealBundle<T>(bundle: T, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array<ArrayBuffer>(new ArrayBuffer(IV_BYTES)));
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );
  const sealed = new Uint8Array<ArrayBuffer>(new ArrayBuffer(iv.length + ciphertext.length));
  sealed.set(iv, 0);
  sealed.set(ciphertext, iv.length);
  return bytesToBase64(sealed);
}

/**
 * Decrypt a bundle, or `null` if the key is wrong.
 *
 * **Returns null rather than throwing**, because a wrong passphrase is the
 * expected case and not an exception. Making it an exception guarantees that
 * somewhere, eventually, a crypto stack trace reaches someone who simply
 * mistyped.
 *
 * GCM's authentication tag is what makes this a real check: a wrong key fails to
 * authenticate rather than yielding plausible-looking garbage. So the client can
 * verify a passphrase entirely on its own, with the server neither knowing nor
 * able to know whether it was right.
 */
export async function openBundle<T>(sealedB64: string, key: CryptoKey): Promise<T | null> {
  let sealed: Uint8Array<ArrayBuffer>;
  try {
    sealed = base64ToBytes(sealedB64);
  } catch {
    return null;
  }
  if (sealed.length <= IV_BYTES) {
    return null;
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.subarray(0, IV_BYTES) },
      key,
      sealed.subarray(IV_BYTES),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    // Covers both a failed tag and a body that is not JSON. Neither is
    // distinguishable to a caller, and neither should be: telling them apart
    // would leak whether the key was right, which is the oracle this design
    // exists to avoid handing anyone.
    return null;
  }
}

/**
 * Why a passphrase was refused, or null if it is acceptable.
 *
 * A floor, not a strength meter. A memory-hard KDF raises the cost of guessing;
 * it does not save `hunter2`, and pretending a rule set can is worse than saying
 * what the rule actually is.
 */
export function passphraseProblem(passphrase: string, email?: string | null): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters. Several words in a row work well and are easier to remember.`;
  }
  if (email && passphrase.trim().toLowerCase() === email.trim().toLowerCase()) {
    // Specific because it is a real habit, and because the failure is total:
    // the one string an attacker already knows is the one that opens everything.
    return 'That is your email address. Anyone who knows it would be able to open your stored connections.';
  }
  return null;
}
