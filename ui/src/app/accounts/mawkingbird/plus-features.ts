import { computed, Injectable, signal } from '@angular/core';

/**
 * Which Mawkingbird Plus features this account has switched on.
 *
 * ## Why these are settings, not sync state
 *
 * `mockingbird_profile_sync` is deliberately `private` — it holds ETags and
 * revisions describing one browser's relationship with a server, which mean
 * nothing anywhere else. These are the opposite: "I want my trust list synced"
 * is a preference, it means the same thing in every browser, and someone who
 * said it once should not have to say it again on their laptop. So the record is
 * classified `setting` and travels with the rest of them.
 *
 * ## Why `settingsSync` is *not* one of these
 *
 * It used to be, and that was the bug: a stored `settingsSync: true` said
 * settings sync was on while `mockingbird_profile_sync` independently sat at
 * `unasked`, so the Plus page showed every feature enabled and the Config page
 * correctly reported "Sync is off on this browser". Both were reading their own
 * switch and both were right.
 *
 * Two switches for one thing is a footgun with no scenario behind it — nobody
 * wants to hold the entitlement and separately not sync. So settings sync now
 * has exactly one piece of state, `ProfileSyncRecord.state`, and the Plus toggle
 * is a *view* of it: see `SettingsSyncToggle`. Every other feature here is a
 * genuine preference with nothing else representing it, which is why they stay.
 *
 * ## Why `undecided` is not `false`
 *
 * The dialog must be shown exactly once per account and must not reappear
 * afterwards. A boolean cannot distinguish "never asked" from "asked, said no",
 * which is the same distinction `profile-sync-state.ts` needed and for the same
 * reason: the first should prompt and the second must never prompt again.
 */

/** The storage key. Registered in `storage-registry.ts` as a `setting`. */
export const PLUS_FEATURES_KEY = 'mockingbird_plus_features';

/**
 * The features a user can switch on.
 *
 * `apiKeys` is available only on the test deployment while the vault is being
 * exercised. `chat` remains planned. Availability is kept separate from this
 * stored preference: a copied production bundle must not be able to turn a
 * test-only backend feature on.
 */
export type PlusFeature = 'corsProxy' | 'trustSync' | 'listsSync' | 'feedsSync' | 'apiKeys';

/** Features shown but not yet available. */
export type PlannedFeature = 'apiKeys' | 'chat';

export const PLUS_FEATURES: readonly PlusFeature[] = [
  'corsProxy',
  'trustSync',
  'listsSync',
  'feedsSync',
  'apiKeys',
];

export const PLANNED_FEATURES: readonly PlannedFeature[] = ['apiKeys', 'chat'];

interface StoredFeatures {
  /** Whether the one-time dialog has been answered. */
  decided: boolean;
  /** Feature id → on. A missing key reads as the default. */
  enabled: Partial<Record<PlusFeature, boolean>>;
}

/**
 * Everything defaults on.
 *
 * Somebody who paid for Plus and then finds none of it running has been given a
 * worse experience than a free user, for money. The dialog exists so the choice
 * is still theirs, but the *default* answer is the one they already indicated by
 * subscribing. Turning any of it off takes one click and stays off.
 */
const DEFAULT_ENABLED = true;

function read(storage: Storage): StoredFeatures {
  try {
    const parsed = JSON.parse(storage.getItem(PLUS_FEATURES_KEY) ?? 'null') as unknown;
    if (parsed === null || typeof parsed !== 'object') {
      return { decided: false, enabled: {} };
    }
    const candidate = parsed as Partial<StoredFeatures>;
    const enabled: Partial<Record<PlusFeature, boolean>> = {};
    for (const feature of PLUS_FEATURES) {
      const value = candidate.enabled?.[feature];
      if (typeof value === 'boolean') {
        enabled[feature] = value;
      }
    }
    return { decided: candidate.decided === true, enabled };
  } catch {
    // A damaged record asks again rather than guessing. Being asked twice is a
    // small annoyance; silently switching off something someone turned on is
    // not.
    return { decided: false, enabled: {} };
  }
}

@Injectable({ providedIn: 'root' })
export class PlusFeatures {
  private storage: Storage = localStorage;
  private state = signal<StoredFeatures>(read(localStorage));

  /** True once the one-time dialog has been answered. */
  readonly decided = computed(() => this.state().decided);

  /** Whether a feature is switched on. */
  isOn(feature: PlusFeature): boolean {
    return this.state().enabled[feature] ?? DEFAULT_ENABLED;
  }

  /** Every feature and its current setting, for rendering a list of toggles. */
  readonly all = computed(() => {
    const enabled = this.state().enabled;
    return PLUS_FEATURES.map((feature) => ({
      feature,
      on: enabled[feature] ?? DEFAULT_ENABLED,
    }));
  });

  /**
   * Record an answer to the dialog.
   *
   * One write for the whole set, because the dialog is one decision with several
   * parts — saving each toggle as it is flipped would leave a half-answered
   * record behind if the page were closed mid-thought.
   */
  save(choices: Partial<Record<PlusFeature, boolean>>): void {
    this.write({ decided: true, enabled: { ...choices } });
  }

  /** Change one feature from the settings page, after the dialog is done. */
  set(feature: PlusFeature, on: boolean): void {
    const current = this.state();
    this.write({ ...current, enabled: { ...current.enabled, [feature]: on } });
  }

  /**
   * Forget the answer, so the dialog is shown again.
   *
   * Called on sign-out: the next account gets its own decision rather than
   * inheriting one made by whoever was signed in before.
   */
  reset(): void {
    try {
      this.storage.removeItem(PLUS_FEATURES_KEY);
    } catch {
      // Storage blocked. The signal is still reset below, which is what the
      // rest of this session reads.
    }
    this.state.set({ decided: false, enabled: {} });
  }

  /** Re-read from storage. For tests, and after storage is replaced underneath. */
  refresh(): void {
    this.state.set(read(this.storage));
  }

  private write(next: StoredFeatures): void {
    this.state.set(next);
    try {
      this.storage.setItem(PLUS_FEATURES_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: honour the choice for this session anyway,
      // rather than throwing into the dialog's Save button.
    }
  }
}
