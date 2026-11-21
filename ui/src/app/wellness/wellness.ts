import { computed, inject, Injectable } from '@angular/core';
import { ClientPrefs } from '../platform/storage/client-prefs';
import {
  effectiveWellness,
  isCustomized,
  WellnessKey,
  WellnessPreset,
  withFlag,
  withPreset,
} from './wellness-model';

/**
 * The effective wellness switches, for components.
 *
 * Components ask this for one decision at a time (`hidePostCounts()`) and
 * never read the stored preset/override record themselves, so a preset change
 * reaches every surface through one computed. Presentation-only switches are
 * also mirrored onto `<html>` attributes by ClientPrefs for global CSS.
 */
@Injectable({ providedIn: 'root' })
export class Wellness {
  private prefs = inject(ClientPrefs);

  readonly settings = this.prefs.wellness.asReadonly();
  readonly flags = computed(() => effectiveWellness(this.prefs.wellness()));
  readonly preset = computed(() => this.prefs.wellness().preset);
  readonly customized = computed(() => isCustomized(this.prefs.wellness()));

  readonly hidePostCounts = computed(() => this.flags().hidePostCounts);
  readonly hideProfileCounts = computed(() => this.flags().hideProfileCounts);
  readonly noHoverCards = computed(() => this.flags().noHoverCards);
  readonly limitedNotifications = computed(() => this.flags().limitedNotifications);
  readonly hideAnalytics = computed(() => this.flags().hideAnalytics);
  readonly forceCalm = computed(() => this.flags().forceCalm);
  readonly demoteGoodStuff = computed(() => this.flags().demoteGoodStuff);

  /** Calm as feeds should apply it: the person's own switch, or Wellness forcing it. */
  readonly calm = computed(() => this.prefs.algoCalm() || this.forceCalm());

  setPreset(preset: WellnessPreset): void {
    this.prefs.setWellness(withPreset(preset));
  }

  set(key: WellnessKey, on: boolean): void {
    this.prefs.setWellness(withFlag(this.prefs.wellness(), key, on));
  }
}
