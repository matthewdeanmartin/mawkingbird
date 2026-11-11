/**
 * Settings sync as a single on/off, for the places that render it as one.
 *
 * ## Why this exists
 *
 * Settings sync had two switches. `PlusFeatures` stored a `settingsSync`
 * boolean that defaulted to **on** the moment someone subscribed, while
 * `ProfileSyncRecord.state` — the thing that actually decides whether anything
 * uploads — independently started at `unasked`. The Plus page read the first
 * and showed sync enabled; the Config page read the second and correctly said
 * "Sync is off on this browser". Neither was lying. There were simply two
 * answers to one question.
 *
 * The fix is not to pick a winner but to delete the duplicate: `settingsSync`
 * is gone from `PlusFeatures`, and this class is the one place that turns
 * `ProfileSync`'s five states into the boolean a toggle needs. Both the Plus
 * page and the Config page talk to this, so they cannot disagree.
 *
 * ## Why the five states survive underneath
 *
 * They are not a competing switch — they are bookkeeping around this one, and
 * each earns its place (see `profile-sync-state.ts`): `unasked` has never been
 * asked, `off` declined and must never be re-prompted, `paused` is the
 * reversible off switch, and `off-but-remote-exists` means another browser said
 * yes. A toggle cannot express that, and does not need to: it needs to know
 * whether sync is running and how to start or stop it. {@link detail} carries
 * the nuance for UI that wants to say more than on/off.
 */

import { computed, inject, Injectable } from '@angular/core';
import { ProfileSync } from './profile-sync';

/** What the underlying state means for someone reading a settings page. */
export type SyncDetail =
  /** Running. */
  | 'on'
  /** Never asked on this browser, and nothing stored anywhere. */
  | 'never-asked'
  /** Stopped here, reversible. */
  | 'paused'
  /** Declined here. Reversible from a settings page, never by a prompt. */
  | 'declined'
  /** Off here, but a settings document exists from another browser. */
  | 'available-elsewhere';

@Injectable({ providedIn: 'root' })
export class SettingsSyncToggle {
  private sync = inject(ProfileSync);

  /** Whether settings sync is running on this browser. The only boolean. */
  readonly on = computed(() => this.sync.syncing());

  /** The state behind the boolean, for copy that can say more than on/off. */
  readonly detail = computed<SyncDetail>(() => {
    switch (this.sync.state()) {
      case 'on':
        return 'on';
      case 'paused':
        return 'paused';
      case 'off':
        return 'declined';
      case 'off-but-remote-exists':
        return 'available-elsewhere';
      default:
        return 'never-asked';
    }
  });

  /**
   * Turn settings sync on or off.
   *
   * Which "on" is the interesting part, and it is deliberately not a single
   * call. A browser that has never synced is *defining* the baseline and must
   * push; one that is rejoining — paused, declined, or syncing elsewhere — must
   * pull, or it would overwrite a profile the user built somewhere else with
   * whatever happens to be in this browser. `ProfileSync` already draws that
   * line between `enable()` and `resume()`; this picks the right side of it so
   * no caller has to know the difference.
   */
  async set(on: boolean): Promise<string | null> {
    if (!on) {
      this.sync.disable();
      return null;
    }
    const detail = this.detail();
    if (detail === 'on') {
      return null;
    }
    // The outcome is returned rather than dropped. Turning sync on can fail for
    // a reason the user needs to hear — a stale token answered 402, the service
    // was unreachable — and a toggle that flips back with no message is the
    // worst version of that: indistinguishable from a dead button.
    const outcome = detail === 'never-asked' ? await this.sync.enable() : await this.sync.resume();
    switch (outcome.kind) {
      case 'read-only':
      case 'failed':
        return outcome.message;
      default:
        return null;
    }
  }
}
