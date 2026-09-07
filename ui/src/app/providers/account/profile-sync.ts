import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  configChanges,
  exportPortableConfig,
  importPortableConfig,
  portableKeys,
  type ConfigChange,
  type PortableConfig,
} from '../../portable-config';
import { type FetchedSettings, ProfileClient, type SettingsDocument } from './profile-client';
import { PageDiagnostics } from '../../page-diagnostics';
import { SupporterStatus } from './supporter-status';
import { MawkingbirdSession } from './mawkingbird-session';
import { STORAGE_KEYS } from '../../storage-registry';
import {
  FAILURES_BEFORE_WARNING,
  isSyncing,
  readSyncRecord,
  shouldOfferRemote,
  shouldOfferResume,
  shouldOfferSync,
  updateSyncRecord,
  writeSyncRecord,
  type ProfileSyncRecord,
  type SyncState,
} from './profile-sync-state';

/**
 * Settings sync.
 *
 * ## Scope
 *
 * The settings document only. Provider collections are server-side with no
 * local copy, so there is nothing to reconcile there — see
 * `mawkingbird_profile/docs/02-sync.md`. That narrowing is what keeps this
 * module small enough to reason about.
 *
 * ## The arbiter is a revision, not a clock
 *
 * Client clocks are wrong — a VM resumed from suspend, a dead CMOS battery, a
 * phone that just crossed a timezone. A browser a few hours fast would win every
 * conflict forever, and the user would watch their other machine's edits vanish
 * with no pattern they could describe. So `revision` decides, and `updatedAt`
 * only breaks ties and gives the UI something human to show.
 *
 * ## Size is not a tiebreaker
 *
 * Worth stating because "newest or largest wins" is the intuitive rule and the
 * second half of it destroys data. Every deliberate act of tidying makes a
 * document *smaller*: turning off feature flags, resetting typography,
 * clearing a customised prompt. Under largest-wins each of those is silently
 * reverted by whichever browser still holds the older, fuller copy — the user's
 * most considered action losing to their most neglected browser. Newest-wins
 * gets these right, because the deletion *is* the newest edit.
 *
 * ## Failure posture
 *
 * Failures degrade; they never break the app. The app worked signed out before
 * this feature existed and must still. A pull failure leaves localStorage alone;
 * a push failure keeps the dirty flag and retries later.
 */

/** A writer id for this browser. Random, not a fingerprint. */
const WRITER_KEY = 'mockingbird_profile_writer';

/** Debounce before pushing a local change, in milliseconds. */
export const PUSH_DEBOUNCE_MS = 10_000;

/**
 * Re-check the manifest when a tab regains focus after this long.
 *
 * Was five minutes, which made the feature look broken in the way it is most
 * often used: change something on one browser, switch to the other to check,
 * and nothing happens — because the throttle swallowed the recheck. Reported
 * after two attempts.
 *
 * Twenty seconds instead. The cost of being wrong in this direction is one
 * small manifest request; the cost in the other is a user concluding sync does
 * not work. `GET /manifest` is a single R2 head plus a KV read, and the
 * document fetch behind it answers 304 when nothing moved.
 */
export const FOCUS_RECHECK_MS = 20 * 1000;

export const SETTINGS_KIND = 'mawkingbird-profile-settings';
export const SETTINGS_SCHEMA_VERSION = 1;

/**
 * What a push did, so the UI can say what happened.
 *
 * Replaced a `boolean`. The boolean was the bug: three call sites discarded it
 * and printed "Saved this browser's settings." unconditionally, so a failed
 * upload was reported as a success. A shape with a `kind` cannot be ignored the
 * same way, and it carries the counts the UI needs to say something specific
 * rather than something reassuring.
 */
export type PushOutcome =
  /** Written. `keys`, `bytes` and `byCategory` describe what actually went up. */
  | {
      kind: 'saved';
      revision: number;
      keys: number;
      bytes: number;
      /** Uploaded key names grouped by their registry sensitivity. */
      byCategory: Record<string, string[]>;
    }
  /** Sync is off on this browser; nothing was attempted. */
  | { kind: 'not-syncing' }
  /** Lapsed, so writes are refused. Reads and export still work. */
  | { kind: 'read-only'; message: string }
  /** Someone else wrote first. Writes stop until this decision is resolved. */
  | ({ kind: 'conflict' } & SyncDecision)
  /** Offline, refused, or unreadable. */
  | { kind: 'failed'; message: string };

/** What a pull decided, so the UI can say what happened. */
export type PullOutcome =
  /** Nothing stored remotely. */
  | { kind: 'absent' }
  /** Remote matched what we already had. */
  | { kind: 'unchanged' }
  /** Remote was ahead and clean locally: applied silently. */
  | { kind: 'applied'; changes: ConfigChange[] }
  /**
   * Remote is ahead AND this browser has unpushed edits. The one case that
   * must ask, because either answer loses something.
   */
  /**
   * `revision` is the *remote* revision, and it is load-bearing: whichever way
   * the user decides, the next write has to advance past it or the service
   * answers 409. Carrying it here rather than re-reading it later is what keeps
   * "keep mine" from needing a second round trip to become legal.
   */
  | ({ kind: 'needs-decision' } & SyncDecision)
  | { kind: 'failed'; message: string };

/** A remote version held apart from the version incorporated by local data. */
export interface SyncDecision {
  remote: PortableConfig;
  /** Local document that competed with `remote` when the decision arose. */
  local: PortableConfig;
  changes: ConfigChange[];
  etag: string;
  revision: number;
}

@Injectable({ providedIn: 'root' })
export class ProfileSync {
  private client = inject(ProfileClient);
  /**
   * Console logging for the sync path.
   *
   * Added after a real session where sync appeared to do nothing: the settings
   * GET 404'd (correct — nothing stored yet), the follow-up push failed, and the
   * UI said "Saved this browser's settings." With no log line anywhere there was
   * no way to tell from the outside which half had gone wrong. Every outcome is
   * logged now, success included, because "it silently worked" and "it silently
   * did nothing" are indistinguishable without one.
   */
  private diagnostics = inject(PageDiagnostics);
  /**
   * Live entitlement, rewritten on every token mint.
   *
   * Costs nothing to depend on: `SupporterStatus` holds one boolean and imports
   * only Angular, which is exactly why it exists as a separate service.
   */
  private supporter = inject(SupporterStatus);
  /**
   * The token source, so a stale free-tier claim can be discarded.
   *
   * Already loaded whenever this module is: `ProfileClient` depends on it.
   */
  private session = inject(MawkingbirdSession);

  /** This browser's view of the account-level switch. */
  readonly record = signal<ProfileSyncRecord>(readSyncRecord());

  /** Increments for every local edit, independently of the persisted dirty bit. */
  private localGeneration = 0;
  /** Invalidates results that were requested for a previous signed-in account. */
  private accountGeneration = 0;
  /** One-at-a-time sync queue. The public operations may safely overlap. */
  private operationQueue: Promise<void> = Promise.resolve();
  /** A remote winner that local settings have not yet incorporated or rejected. */
  private unresolvedConflict: SyncDecision | null = null;

  /**
   * Re-read the record when the signed-in account changes.
   *
   * `signOut()` clears the account-scoped keys from storage, but this signal was
   * populated at construction and would happily go on reporting the previous
   * account's sync state — including scheduling pushes for it — because the
   * Plus page signs out without reloading.
   *
   * Reacting to `user()` rather than being called by the session keeps the
   * dependency pointing this way: the session stays free of any knowledge of
   * sync, which is what allows this whole module to stay lazily loaded.
   */
  private readonly accountWatch = effect(() => {
    // Read defensively. This runs during change detection, where a throw is an
    // application-level error — and the whole posture of this module is that
    // sync failing must never mean the app does not load.
    this.session.user?.();
    this.accountGeneration += 1;
    this.localGeneration += 1;
    this.unresolvedConflict = null;
    this.cancelPush();
    this.record.set(readSyncRecord());
  });

  /** True while a push or pull is in flight. */
  readonly busy = signal(false);

  /** The last failure worth showing, or null. */
  readonly error = signal<string | null>(null);

  /**
   * Whether the service last refused a write for payment.
   *
   * Private, and never read directly — see {@link readOnly}. Latching this on
   * its own was a real bug: tokens are minted twice on a cold load, and the
   * first mint reports `tier: 'free'` before the subscription lookup completes.
   * A `start()` landing in that window recorded read-only and nothing ever
   * cleared it, so a paying account was told "your subscription has lapsed"
   * for the rest of the session and every push was skipped.
   */
  private readonly refusedForPayment = signal(false);

  /**
   * True when the subscription lapsed: reads work, writes do not.
   *
   * Derived rather than latched. `SupporterStatus` is rewritten on **every**
   * mint, so when the corrected `tier: 'plus'` token arrives this clears itself
   * — no re-check, no ordering assumption, and no way for a stale observation
   * to outlive the fact it was about.
   *
   * The refusal still counts: a supporter flag that says yes while the service
   * says 402 means the service is right and the flag is ahead of a lapse it has
   * not seen yet. So this is "refused AND not currently entitled".
   */
  readonly readOnly = computed(() => this.refusedForPayment() && !this.supporter.isSupporter());

  readonly syncing = computed(() => isSyncing(this.record()));
  readonly lastSyncedAt = computed(() => this.record().lastSyncedAt ?? null);

  /**
   * The sync state itself, for UI that must distinguish the ways of being off.
   *
   * Just the state, not the record: the ETag, revision and dirty flag are this
   * browser's bookkeeping with the server and mean nothing to a settings page.
   * Exposing the record wholesale would invite a component to make decisions
   * from them, which is how a second source of truth starts.
   */
  readonly state = computed<SyncState>(() => this.record().state);

  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastManifestAt = 0;
  /** Entitlement as it stood when `start()` last read the manifest. */
  private startedEntitled = false;

  /** Whether to show the first-enable prompt. */
  offersSync(entitled: boolean): boolean {
    return shouldOfferSync(this.record(), entitled);
  }

  /** Whether to show the "settings exist from another browser" offer. */
  offersRemote(): boolean {
    return shouldOfferRemote(this.record());
  }

  /** Whether to show a plain "turn sync on" control for a stopped browser. */
  offersResume(entitled: boolean): boolean {
    return shouldOfferResume(this.record(), entitled);
  }

  /**
   * Turn sync on, uploading this browser's settings as the baseline.
   *
   * The upload is the whole reason this is a deliberate action: the first push
   * defines what every other machine will inherit. The UI must say so before
   * calling this.
   */
  async enable(): Promise<PushOutcome> {
    this.setRecord(updateSyncRecord({ state: 'on', dirty: true }));
    // Interactive: the user just clicked "Turn on sync", so a failure has to be
    // reported now rather than counted towards a later warning.
    //
    // On failure sync is left `on` with the dirty flag set, so the next trigger
    // retries. Turning it back off would discard an explicit decision because
    // of a transient network blip — but the caller is still told it failed.
    return this.push(true);
  }

  /**
   * Decline sync. Permanent — the prompt never returns.
   *
   * From `off-but-remote-exists` this means "not on this browser", which is the
   * same stored state: a decision not to participate here.
   */
  decline(): void {
    this.setRecord(updateSyncRecord({ state: 'off' }));
  }

  /**
   * Stop syncing, keeping everything as it stands.
   *
   * Does **not** delete the stored document. Someone turning sync off is saying
   * "stop changing my browser", not "destroy my profile", and conflating those
   * would make the off switch frightening to use.
   */
  disable(): void {
    this.cancelPush();
    // `paused`, not `off`: this is the off *switch*, and it has to be
    // reversible. Writing `off` here made a misclick permanent, because `off`
    // is the declined-the-prompt state and nothing offers a way out of it.
    //
    // The etag and revision are deliberately kept. They are what lets a resume
    // pick up where this browser left off instead of colliding with its own
    // last write.
    this.setRecord(updateSyncRecord({ state: 'paused', dirty: false }));
  }

  /**
   * Turn sync back on after it was stopped or declined.
   *
   * Pulls rather than pushes, which is the opposite of {@link enable} and the
   * safer direction here. `enable()` uploads because a first-run browser is
   * *defining* the baseline; a resuming browser is rejoining one that may have
   * moved on without it, and blindly pushing stale local settings would
   * overwrite whatever the other browsers have done since.
   *
   * `pull()` already handles the case where this browser has unpushed edits: it
   * returns `needs-decision` and the UI asks, rather than either side losing.
   *
   * Which is why this marks the browser dirty first. While sync was off,
   * `noteLocalChange()` returned early for every edit, so the flag says nothing
   * about the paused window — and the whole point of that window is that people
   * change settings during it. Assuming clean would let `pull()` take the
   * silent-overwrite path and discard exactly those edits. Assuming dirty costs
   * at most one conflict prompt that the user can answer with "use the other
   * device's"; assuming clean costs their settings with no prompt at all.
   */
  async resume(): Promise<PullOutcome> {
    this.setRecord(updateSyncRecord({ state: 'on', dirty: true }));
    return this.pull();
  }

  /**
   * Apply a fetched settings document, or hand the conflict back to the UI.
   *
   * Extracted so the ordinary path and the retry-without-etag path above cannot
   * drift: both have to make the same decision about a dirty browser, and a
   * second copy of it is a second place for that rule to be got wrong.
   */
  private applyFetched(value: FetchedSettings, account: number, local: number): PullOutcome {
    if (account !== this.accountGeneration || !this.syncing()) {
      return {
        kind: 'failed',
        message: 'The signed-in account changed while settings were loading.',
      };
    }
    const { document, etag } = value;
    const remote = this.toPortableConfig(document);
    const changes = configChanges(remote, localStorage);

    if (this.record().dirty === true || local !== this.localGeneration) {
      // The one case that must ask. Deliberately does not apply anything
      // first: the user may choose to keep this browser's copy, and a partial
      // application would have already destroyed it.
      this.diagnostics.info('ProfileSync', 'pull:needs-decision', {
        remoteRevision: document.revision,
        differing: changes.length,
      });
      const decision = {
        remote,
        local: exportPortableConfig(localStorage, false),
        changes,
        etag,
        revision: document.revision,
      };
      this.unresolvedConflict = decision;
      return { kind: 'needs-decision', ...decision };
    }

    importPortableConfig(remote, localStorage);
    this.setRecord(
      updateSyncRecord({
        etag,
        revision: document.revision,
        dirty: false,
        lastSyncedAt: Date.now(),
        failures: 0,
      }),
    );
    this.diagnostics.info('ProfileSync', 'pull:applied', {
      revision: document.revision,
      changed: changes.length,
      keys: changes.map((change) => change.key),
    });
    return { kind: 'applied', changes };
  }

  /**
   * Adopt the settings already stored for this account.
   *
   * The `off-but-remote-exists` answer. Pulls, applies, and turns sync on.
   */
  async adoptRemote(): Promise<PullOutcome> {
    this.setRecord(updateSyncRecord({ state: 'on', dirty: false }));
    return this.pull();
  }

  /**
   * Settle sync state on startup.
   *
   * Cheap: one manifest call. Detects `off-but-remote-exists`, notices a lapsed
   * subscription, and pulls only when there is something to pull.
   */
  async start(): Promise<void> {
    return this.serialize(() => this.startNow());
  }

  private async startNow(): Promise<void> {
    const account = this.accountGeneration;
    const manifest = await this.client.manifest();
    if (account !== this.accountGeneration) {
      return;
    }
    this.lastManifestAt = Date.now();

    if (manifest.kind === 'payment-required') {
      this.refusedForPayment.set(true);
      this.diagnostics.info('ProfileSync', 'start:read-only', { reason: 'payment-required' });
      return;
    }
    // The manifest reflects whichever token was current when it was fetched,
    // and on a cold load that is often the pre-subscription-lookup one. Record
    // what we saw so `recheckEntitlement()` can tell a stale answer from a real
    // one without refetching on every mint.
    this.startedEntitled = this.supporter.isSupporter();
    if (manifest.kind !== 'ok') {
      // Signed out or unreachable. Neither is an error worth showing to the
      // user — the app works without this service — but both are worth a log
      // line, because 'sync did nothing' and 'sync could not reach the
      // service' look the same from the outside.
      this.diagnostics.info('ProfileSync', 'start:unavailable', { kind: manifest.kind });
      return;
    }

    this.refusedForPayment.set(manifest.value.readOnly);
    const current = this.record();

    // Locally never asked, remotely present: they enabled sync somewhere else.
    if (current.state === 'unasked' && manifest.value.settings) {
      this.setRecord(updateSyncRecord({ state: 'off-but-remote-exists' }));
      this.diagnostics.info('ProfileSync', 'start:remote-exists', {
        remoteRevision: manifest.value.settings.revision,
      });
      return;
    }

    if (!isSyncing(current)) {
      this.diagnostics.info('ProfileSync', 'start:not-syncing', { state: current.state });
      return;
    }

    // Only fetch when the remote is actually ahead. A revision comparison costs
    // nothing and saves a round trip on every start where nothing changed.
    const remoteRevision = manifest.value.settings?.revision;
    this.diagnostics.info('ProfileSync', 'start:syncing', {
      localRevision: current.revision ?? null,
      remoteRevision: remoteRevision ?? null,
      dirty: current.dirty ?? false,
      readOnly: manifest.value.readOnly,
    });
    if (remoteRevision !== undefined && remoteRevision > (current.revision ?? -1)) {
      await this.pullNow();
    }
  }

  /**
   * Re-run startup when entitlement improves after the fact.
   *
   * ## Why this exists
   *
   * Tokens are minted twice on a cold load. The first reports `tier: 'free'`
   * because the subscription lookup has not finished; the second reports the
   * real tier. A `start()` that lands in that window fetches a manifest saying
   * `readOnly: true`, and every later push is skipped — a paying account told
   * its subscription had lapsed, observed in a real session.
   *
   * {@link readOnly} being computed already fixes the *message*. This fixes the
   * *state*: the manifest itself was read under the wrong identity, so the
   * offers and revisions derived from it are equally stale and the whole of
   * `start()` has to run again.
   *
   * Cheap and idempotent — it only refetches when entitlement actually crossed
   * from false to true since the last read, so the common case where the tier
   * was right the first time costs one boolean comparison.
   */
  async recheckEntitlement(): Promise<void> {
    if (!this.supporter.isSupporter() || this.startedEntitled) {
      return;
    }
    // Discard the held free-tier token *before* re-reading. The manifest is
    // only as good as the claim it was fetched with, and re-asking with the
    // same stale token gets the same correct 402 — which is what made the
    // previous attempt at this look racy rather than simply wrong.
    // Guarded: a token refresh that throws must not cost us the manifest
    // re-read, which is the part that actually repairs the stale state.
    let upgraded = false;
    try {
      upgraded = await this.session.upgradeIfStale(true);
    } catch (error: unknown) {
      this.diagnostics.error('ProfileSync', 'entitlement:upgrade-failed', error);
    }
    this.diagnostics.info('ProfileSync', 'entitlement:improved', {
      upgradedToken: upgraded,
      note: 'tier corrected after startup; re-reading the manifest',
    });
    await this.start();
  }

  /**
   * Re-check when a tab regains focus, if it has been a while.
   *
   * Cheap by construction: the manifest is small, and a 304 on the document
   * itself costs almost nothing. This is what catches the other-machine case
   * without polling.
   */
  async recheckOnFocus(force = false): Promise<void> {
    if (!this.syncing()) {
      return;
    }
    if (!force && Date.now() - this.lastManifestAt < FOCUS_RECHECK_MS) {
      this.diagnostics.info('ProfileSync', 'focus:throttled', {
        sinceLastManifestMs: Date.now() - this.lastManifestAt,
      });
      return;
    }
    await this.start();
  }

  /**
   * Note that a synced setting changed locally.
   *
   * Sets the dirty flag immediately and schedules a debounced push. The flag
   * matters more than the timer: it is what makes a later pull ask rather than
   * silently overwrite.
   */
  noteLocalChange(): void {
    if (!this.syncing()) {
      return;
    }
    this.localGeneration += 1;
    this.setRecord(updateSyncRecord({ dirty: true }));
    this.schedulePush();
  }

  /**
   * Pull the stored document and decide what to do with it.
   *
   * The decision table, and the reasoning for each row:
   *
   * - **Not dirty, remote ahead** → apply silently. This is the overwhelmingly
   *   common path and prompting here would train people to click through.
   * - **Dirty, remote ahead** → ask. Either answer loses something, so it is
   *   not ours to choose.
   * - **Unchanged or absent** → nothing to do.
   */
  async pull(): Promise<PullOutcome> {
    return this.serialize(() => this.pullNow());
  }

  private async pullNow(): Promise<PullOutcome> {
    if (this.unresolvedConflict) {
      return { kind: 'needs-decision', ...this.unresolvedConflict };
    }
    const current = this.record();
    const account = this.accountGeneration;
    const local = this.localGeneration;
    this.busy.set(true);
    try {
      const fetched = await this.client.fetchSettings(current.etag);

      if (account !== this.accountGeneration) {
        return {
          kind: 'failed',
          message: 'The signed-in account changed while settings were loading.',
        };
      }

      if (fetched.kind === 'unchanged') {
        this.diagnostics.info('ProfileSync', 'pull:unchanged', { etag: current.etag ?? null });
        return { kind: 'unchanged' };
      }
      if (fetched.kind === 'absent') {
        // A 404 here is normal and not a failure: nothing has been stored for
        // this account yet. Logged at info so a console reader can tell it apart
        // from the request having gone wrong, which looks identical in devtools.
        this.diagnostics.info('ProfileSync', 'pull:absent', {
          note: 'nothing stored for this account yet',
        });
        return { kind: 'absent' };
      }
      if (fetched.kind === 'payment-required') {
        this.refusedForPayment.set(true);
        this.diagnostics.warn('ProfileSync', 'pull:payment-required', { message: fetched.message });
        return { kind: 'failed', message: fetched.message };
      }
      if (fetched.kind !== 'ok') {
        const message = 'message' in fetched ? fetched.message : 'Could not read your profile.';
        this.diagnostics.warn('ProfileSync', 'pull:failed', { kind: fetched.kind, message });
        // A conditional read that fails is worth exactly one unconditional
        // retry before giving up.
        //
        // `If-None-Match` is sent from a locally persisted etag, so a bad one
        // makes every pull fail the same way — through reloads, and for as long
        // as the value sits in localStorage. That is a sync stuck permanently
        // on a value the user cannot see and has no way to clear. Dropping the
        // etag and asking once more costs one request and turns a dead end into
        // a self-repair; if the plain read fails too, the failure is real and
        // reported as before.
        if (current.etag) {
          this.diagnostics.info('ProfileSync', 'pull:retry-without-etag', {});
          const retried = await this.client.fetchSettings();
          if (account !== this.accountGeneration) {
            return {
              kind: 'failed',
              message: 'The signed-in account changed while settings were loading.',
            };
          }
          if (retried.kind === 'ok') {
            return this.applyFetched(retried.value, account, local);
          }
          if (retried.kind === 'absent') {
            this.setRecord(updateSyncRecord({ etag: undefined }));
            return { kind: 'absent' };
          }
        }
        return { kind: 'failed', message };
      }

      return this.applyFetched(fetched.value, account, local);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Resolve a `needs-decision` by taking the other browser's copy.
   *
   * The local copy is not preserved here — the service keeps a conflict sidecar
   * when a write loses, and this path is a *read* that never wrote. If the local
   * copy matters, {@link keepLocal} pushes it instead, and the remote becomes
   * the sidecar.
   */
  useRemote(remote: PortableConfig, etag: string, revision: number): ConfigChange[] {
    this.cancelPush();
    const changes = configChanges(remote, localStorage);
    importPortableConfig(remote, localStorage);
    this.localGeneration += 1;
    this.unresolvedConflict = null;
    this.setRecord(
      updateSyncRecord({ etag, revision, dirty: false, lastSyncedAt: Date.now(), failures: 0 }),
    );
    return changes;
  }

  /**
   * Resolve a `needs-decision` by keeping this browser's copy.
   *
   * Adopts the remote ETag and revision so the subsequent push is a legal update
   * rather than a doomed create — the local *content* wins, the remote
   * *position in the sequence* is respected.
   */
  async keepLocal(etag: string, remoteRevision: number): Promise<PushOutcome> {
    return this.serialize(async () => {
      this.unresolvedConflict = null;
      this.setRecord(updateSyncRecord({ etag, revision: remoteRevision, dirty: true }));
      // Interactive: the user picked this in a dialog, so a failure must say so.
      return this.pushNow(true);
    });
  }

  /**
   * Push this browser's settings.
   *
   * Never throws into a caller: a UI action must not fail because a background
   * sync did. The outcome is *returned* rather than only recorded, because the
   * two kinds of caller need different things from it — see {@link PushOutcome}
   * and the `interactive` flag.
   *
   * `interactive` marks a push the user asked for by clicking something. Those
   * report a failure immediately; background pushes stay quiet until the failure
   * looks persistent, since one blip is usually a tunnel and not worth a
   * message. Reporting nothing at all for a *clicked* button is the bug this
   * flag exists to make impossible.
   */
  async push(interactive = false): Promise<PushOutcome> {
    return this.serialize(() => this.pushNow(interactive));
  }

  private async pushNow(interactive = false): Promise<PushOutcome> {
    if (!this.syncing()) {
      this.diagnostics.info('ProfileSync', 'push:skipped', { reason: 'not-syncing' });
      return { kind: 'not-syncing' };
    }
    // `readOnly` may be a verdict reached under a stale free-tier token: the
    // manifest is fetched with whatever credential was current, and on a cold
    // load that predates the subscription lookup. Refusing here on that basis
    // would make the flag self-sustaining — nothing would ever ask again, so
    // nothing would ever discover it was wrong. When the account is entitled,
    // let the request through and believe the service instead.
    if (this.readOnly() && !this.supporter.isSupporter()) {
      this.diagnostics.info('ProfileSync', 'push:skipped', { reason: 'read-only' });
      return {
        kind: 'read-only',
        // Covers "never subscribed" as much as "lapsed", and only the second
        // of those is something the reader let happen.
        message:
          'Settings are not being saved to your account, because storing them there is part of Mawkingbird Plus.',
      };
    }
    if (this.unresolvedConflict) {
      this.diagnostics.info('ProfileSync', 'push:blocked-by-conflict', {
        remoteRevision: this.unresolvedConflict.revision,
      });
      return { kind: 'conflict', ...this.unresolvedConflict };
    }
    this.cancelPush();
    this.busy.set(true);
    try {
      const current = this.record();
      const account = this.accountGeneration;
      const local = this.localGeneration;
      const document = this.buildDocument((current.revision ?? 0) + 1);
      const result = await this.client.putSettings(document, current.etag);

      if (account !== this.accountGeneration) {
        return { kind: 'not-syncing' };
      }

      if (result.kind === 'ok') {
        this.setRecord(
          updateSyncRecord({
            etag: result.value.etag,
            revision: result.value.revision,
            dirty: local === this.localGeneration ? false : true,
            lastSyncedAt: Date.now(),
            failures: 0,
            warning: undefined,
          }),
        );
        this.error.set(null);
        this.diagnostics.info('ProfileSync', 'push:ok', {
          revision: result.value.revision,
          keys: Object.keys(document.values).length,
          bytes: new Blob([JSON.stringify(document)]).size,
          byCategory: groupBySensitivity(Object.keys(document.values)),
          interactive,
        });
        return {
          kind: 'saved',
          revision: result.value.revision,
          keys: Object.keys(document.values).length,
          bytes: new Blob([JSON.stringify(document)]).size,
          byCategory: groupBySensitivity(Object.keys(document.values)),
        };
      }

      if (result.kind === 'conflict') {
        // Keep the incorporated ETag/revision unchanged. The winner is merely
        // observed until the user chooses; adopting it here would authorize a
        // later automatic write to overwrite data this browser never merged.
        const remote = this.toPortableConfig(result.current);
        const decision = {
          remote,
          local: this.toPortableConfig(document),
          changes: configChanges(remote, localStorage),
          etag: result.etag,
          revision: result.current.revision,
        };
        this.unresolvedConflict = decision;
        this.setRecord(updateSyncRecord({ dirty: true }));
        this.diagnostics.info('ProfileSync', 'push:conflict', {
          remoteRevision: result.current.revision,
        });
        return { kind: 'conflict', ...decision };
      }

      if (result.kind === 'payment-required') {
        // A 402 while the account *is* entitled means the token is stale, not
        // the subscription. The auth token is minted before the subscription
        // lookup can answer, so a browser that subscribed in this session holds
        // a `tier: free` claim the service rightly rejects. Re-mint once and
        // retry; only a second refusal is really about payment.
        //
        // Deliberately not a loop: `upgradeIfStale` returns false unless it
        // actually replaced a free token with a better one, so this can run at
        // most once per push and cannot spin against a genuinely lapsed account.
        if (this.supporter.isSupporter() && (await this.session.upgradeIfStale(true))) {
          this.diagnostics.info('ProfileSync', 'push:retry-after-upgrade', {
            note: 'token said free while the account is entitled; re-minted',
          });
          const retry = await this.client.putSettings(document, current.etag);
          if (account !== this.accountGeneration) {
            return { kind: 'not-syncing' };
          }
          if (retry.kind === 'ok') {
            this.setRecord(
              updateSyncRecord({
                etag: retry.value.etag,
                revision: retry.value.revision,
                dirty: local === this.localGeneration ? false : true,
                lastSyncedAt: Date.now(),
                failures: 0,
                warning: undefined,
              }),
            );
            this.error.set(null);
            this.refusedForPayment.set(false);
            this.diagnostics.info('ProfileSync', 'push:ok', {
              revision: retry.value.revision,
              keys: Object.keys(document.values).length,
              bytes: new Blob([JSON.stringify(document)]).size,
              byCategory: groupBySensitivity(Object.keys(document.values)),
              interactive,
              afterUpgrade: true,
            });
            return {
              kind: 'saved',
              revision: retry.value.revision,
              keys: Object.keys(document.values).length,
              bytes: new Blob([JSON.stringify(document)]).size,
              byCategory: groupBySensitivity(Object.keys(document.values)),
            };
          }
        }
        this.refusedForPayment.set(true);
        this.error.set(result.message);
        this.diagnostics.warn('ProfileSync', 'push:payment-required', { message: result.message });
        return { kind: 'read-only', message: result.message };
      }

      const message = 'message' in result ? result.message : 'Could not save your settings.';
      // Logged unconditionally, even when noteFailure() stays quiet: the point
      // of the debounce is not to nag the user, not to hide the failure from
      // whoever is reading a console trying to work out why nothing synced.
      this.diagnostics.warn('ProfileSync', 'push:failed', {
        kind: result.kind,
        message,
        interactive,
      });
      this.noteFailure(message, interactive);
      return { kind: 'failed', message };
    } finally {
      this.busy.set(false);
    }
  }

  /** Cancel a pending debounced push. */
  cancelPush(): void {
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
  }

  /** The diff between a remote document and this browser, for a preview. */
  changesAgainstLocal(remote: PortableConfig): ConfigChange[] {
    return configChanges(remote, localStorage);
  }

  /** What this browser would upload, for the "show me first" affordance. */
  previewUpload(): PortableConfig {
    return exportPortableConfig(localStorage, false);
  }

  private schedulePush(): void {
    this.cancelPush();
    // Debounced because Class A (write) operations are the expensive ones.
    // Toggling a setting five times should be one write, not five.
    this.pushTimer = setTimeout(() => void this.push(), PUSH_DEBOUNCE_MS);
  }

  /** Run network state transitions in request order, even when callers overlap. */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Build the document to upload.
   *
   * `exportPortableConfig` is the source of truth for *what* goes in — including
   * its `assertSafeConfig()` leak test, which greps the payload against the
   * credentials actually in this browser's storage. That check is the real
   * boundary; the service's own pattern matching is a backstop for a modified
   * client. Building the document any other way would skip it.
   */
  private buildDocument(revision: number): SettingsDocument {
    const config = exportPortableConfig(localStorage, false);
    return {
      kind: SETTINGS_KIND,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      minimumReaderVersion: SETTINGS_SCHEMA_VERSION,
      revision,
      updatedAt: new Date().toISOString(),
      writer: this.writerId(),
      values: config.values,
      // The exact allowlist, so the service can validate precisely. It cannot
      // derive this: distinguishing a scoped key from an underscored global one
      // needs the registry, which the service deliberately does not hold.
      keys: portableKeys('standard'),
    };
  }

  /**
   * Turn a stored document back into a portable config.
   *
   * The two formats are deliberately close but not identical: the portable one
   * carries `privacy` and `exportedAt`, the stored one carries `revision` and
   * `writer`. Converting here rather than widening either keeps
   * `portable-config.ts` unaware that a sync service exists.
   */
  private toPortableConfig(document: SettingsDocument): PortableConfig {
    return {
      kind: 'mockingbird-client-config',
      schemaVersion: 1,
      minimumReaderVersion: 1,
      exportedAt: document.updatedAt,
      privacy: 'standard',
      values: document.values,
    };
  }

  /**
   * A stable random id for this browser.
   *
   * Only so a conflict can say "your other browser" instead of "someone". Not a
   * fingerprint, and never sent anywhere except inside the user's own document.
   */
  private writerId(): string {
    try {
      const existing = localStorage.getItem(WRITER_KEY);
      if (existing) {
        return existing;
      }
      const created = `dev_${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem(WRITER_KEY, created);
      return created;
    } catch {
      return 'dev_unknown';
    }
  }

  /**
   * Record a push failure, surfacing it only once it looks permanent.
   *
   * Silent permanent failure is how someone discovers on a new laptop that
   * nothing has synced since March. One failed push, though, is usually a tunnel
   * or a sleeping laptop and is not worth a message.
   */
  private noteFailure(message: string, interactive = false): void {
    const failures = (this.record().failures ?? 0) + 1;
    const patch: Partial<ProfileSyncRecord> = { failures, dirty: true };
    // A push the user asked for reports immediately. The counting exists to
    // keep *background* failures quiet until they look persistent, and applying
    // that patience to a clicked button means the click appears to do nothing.
    if (interactive || failures >= FAILURES_BEFORE_WARNING) {
      patch.warning = message;
      this.error.set(message);
    }
    this.setRecord(updateSyncRecord(patch));
  }

  private setRecord(next: ProfileSyncRecord): void {
    this.record.set(next);
  }

  /** Reset this browser's sync state. Test-only. */
  resetForTest(record: ProfileSyncRecord): void {
    writeSyncRecord(record);
    this.record.set(record);
    this.localGeneration = 0;
    this.unresolvedConflict = null;
  }
}

/**
 * Group uploaded key names by their registry sensitivity.
 *
 * Read from `storage-registry.ts` rather than from a list kept here, so the
 * breakdown shown to the user cannot drift from the classification that
 * actually decides what may be exported. A key with no registry entry is
 * impossible in practice — `exportPortableConfig()` only emits registered keys
 * — but is grouped as `unclassified` rather than dropped, because silently
 * omitting something from a summary of what was uploaded would defeat its
 * purpose.
 */
function groupBySensitivity(keys: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const key of keys) {
    const spec = STORAGE_KEYS.find((candidate) => candidate.base === key);
    const category = spec?.sensitivity ?? 'unclassified';
    grouped[category] = [...(grouped[category] ?? []), key];
  }
  return grouped;
}
