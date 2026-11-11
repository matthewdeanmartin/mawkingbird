/**
 * Whether settings sync is on, and what this browser knows about the account's
 * stored profile.
 *
 * ## Five states, not a boolean
 *
 * A boolean cannot express the cases that actually cause support questions:
 *
 * - **`unasked`** — never prompted. The prompt fires on the Plus page when the
 *   account is entitled and this is the state.
 * - **`on`** — syncing.
 * - **`off`** — asked, declined. **Never prompt again.** A prompt that returns
 *   after a decline is a nag, and it teaches people to dismiss dialogs without
 *   reading them. Not prompting is not the same as hiding the control: the
 *   settings page always offers a way back, because a page the user navigated
 *   to deliberately is not a nag.
 * - **`paused`** — was on, switched off here. Reversible, and distinct from
 *   `off` precisely so it can be: "stop syncing" is an off *switch*, and people
 *   click it by mistake. Collapsing it into `off` is what made the off switch a
 *   one-way door.
 * - **`off-but-remote-exists`** — not syncing here, but a settings document
 *   exists on the server. They said yes somewhere, sometime.
 *
 * `off-but-remote-exists` is the one that gets forgotten. It happens whenever someone enables
 * sync on one machine and later signs in on another: locally `unasked`,
 * remotely present. Silently pulling would be alarming (settings changing on
 * their own); silently ignoring would waste something they deliberately turned
 * on. So it is its own state with its own one-time offer.
 *
 * ## What is deliberately not here
 *
 * A per-device opt-out. Sync is an account-level setting: once on, every browser
 * signed into that account participates. That removes an entire class of "why is
 * my laptop different" and removes the need to model per-device state at all.
 *
 * This state is *this browser's view* of an account-level switch, not a
 * per-device preference — which is why it is keyed by nothing and simply
 * re-derived when the account changes.
 */

/** The storage key. Registered in `storage-registry.ts` as `private`. */
export const PROFILE_SYNC_KEY = 'mockingbird_profile_sync';

export type SyncState = 'unasked' | 'on' | 'off' | 'paused' | 'off-but-remote-exists';

export interface ProfileSyncRecord {
  state: SyncState;
  /**
   * The ETag of the settings document as this browser last saw it.
   *
   * Load-bearing: it is what every conditional write sends as `If-Match`, and
   * an absent one means the next write must create rather than update.
   */
  etag?: string;
  /** The revision this browser last successfully wrote or pulled. */
  revision?: number;
  /**
   * True when a synced setting changed locally since the last successful push.
   *
   * The single most important field for not losing data: a remote-ahead pull is
   * silent when this is false and prompts when it is true. Without it, every
   * pull would either overwrite unsaved local edits or interrupt the user.
   */
  dirty?: boolean;
  /** When the last successful sync happened, for the UI to show. */
  lastSyncedAt?: number;
  /** A persistent failure worth surfacing, after repeated push attempts. */
  warning?: string;
  /** Consecutive failed pushes. Surfaced once this crosses a threshold. */
  failures?: number;
}

/** Failures before a push problem is shown rather than retried quietly. */
export const FAILURES_BEFORE_WARNING = 5;

const DEFAULT: ProfileSyncRecord = { state: 'unasked' };

function isSyncState(value: unknown): value is SyncState {
  return (
    value === 'unasked' ||
    value === 'on' ||
    value === 'off' ||
    value === 'paused' ||
    value === 'off-but-remote-exists'
  );
}

/**
 * Read this browser's sync record.
 *
 * A damaged record resets to `unasked` rather than guessing. That is the safe
 * direction: the worst outcome is being asked once more, whereas guessing `on`
 * would start uploading without consent.
 */
export function readSyncRecord(storage: Storage = localStorage): ProfileSyncRecord {
  try {
    const parsed = JSON.parse(storage.getItem(PROFILE_SYNC_KEY) ?? 'null') as unknown;
    if (parsed === null || typeof parsed !== 'object') {
      return { ...DEFAULT };
    }
    const candidate = parsed as Partial<ProfileSyncRecord>;
    if (!isSyncState(candidate.state)) {
      return { ...DEFAULT };
    }
    return {
      state: candidate.state,
      ...(typeof candidate.etag === 'string' ? { etag: candidate.etag } : {}),
      ...(typeof candidate.revision === 'number' ? { revision: candidate.revision } : {}),
      ...(candidate.dirty === true ? { dirty: true } : {}),
      ...(typeof candidate.lastSyncedAt === 'number'
        ? { lastSyncedAt: candidate.lastSyncedAt }
        : {}),
      ...(typeof candidate.warning === 'string' ? { warning: candidate.warning } : {}),
      ...(typeof candidate.failures === 'number' ? { failures: candidate.failures } : {}),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeSyncRecord(record: ProfileSyncRecord, storage: Storage = localStorage): void {
  try {
    storage.setItem(PROFILE_SYNC_KEY, JSON.stringify(record));
  } catch {
    // Storage full or blocked. Sync degrades to off for this session rather
    // than throwing into whatever triggered the write.
  }
}

/** Merge a partial update into the stored record. */
export function updateSyncRecord(
  patch: Partial<ProfileSyncRecord>,
  storage: Storage = localStorage,
): ProfileSyncRecord {
  const next = { ...readSyncRecord(storage), ...patch };
  writeSyncRecord(next, storage);
  return next;
}

/** Whether this browser should be pushing and pulling. */
export function isSyncing(record: ProfileSyncRecord): boolean {
  return record.state === 'on';
}

/**
 * Whether the first-enable prompt should be shown.
 *
 * Only from `unasked`, and only when entitled. The other non-syncing states all
 * have their own, different offer: `off-but-remote-exists` adopts what is
 * already stored, while `off` and `paused` get the plain resume control from
 * {@link shouldOfferResume}. This one is the *first-run* prompt specifically,
 * which is why it never returns once answered.
 */
export function shouldOfferSync(record: ProfileSyncRecord, entitled: boolean): boolean {
  return entitled && record.state === 'unasked';
}

/**
 * Whether a plain "turn sync on" control belongs on the settings page.
 *
 * True for every entitled state that is not already syncing and is not one of
 * the two states with their own richer offer. That deliberately includes `off`:
 * declining suppresses the *prompt*, not the user's ability to change their
 * mind on a page they went looking for.
 *
 * Entitlement is still required — offering a button that can only 402 is worse
 * than offering nothing.
 */
export function shouldOfferResume(record: ProfileSyncRecord, entitled: boolean): boolean {
  return entitled && (record.state === 'off' || record.state === 'paused');
}

/**
 * Whether the "settings exist from another browser" offer should be shown.
 *
 * Distinct from the first-enable prompt because the decision is different: this
 * one is "adopt what is already there", not "upload what is here".
 */
export function shouldOfferRemote(record: ProfileSyncRecord): boolean {
  return record.state === 'off-but-remote-exists';
}
