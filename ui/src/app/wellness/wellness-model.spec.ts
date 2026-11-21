import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WELLNESS,
  effectiveWellness,
  isCustomized,
  isEngagementNotification,
  normalizeWellness,
  PRESET_FLAGS,
  WELLNESS_KEYS,
  wellnessRootAttributes,
  withFlag,
  withPreset,
} from './wellness-model';

describe('wellness model', () => {
  it('defaults to Off with every protection off (owner: Off is the default)', () => {
    expect(DEFAULT_WELLNESS.preset).toBe('off');
    const flags = effectiveWellness(DEFAULT_WELLNESS);
    expect(WELLNESS_KEYS.every((key) => !flags[key])).toBe(true);
  });

  it('Strong is a superset of Gentle', () => {
    for (const key of WELLNESS_KEYS) {
      if (PRESET_FLAGS.gentle[key]) expect(PRESET_FLAGS.strong[key]).toBe(true);
    }
  });

  it('manual grayscale is in no preset', () => {
    expect(PRESET_FLAGS.off.grayscale || PRESET_FLAGS.gentle.grayscale).toBe(false);
    expect(PRESET_FLAGS.strong.grayscale).toBe(false);
  });

  it('Gentle hides feed counts but not profile counts', () => {
    const flags = effectiveWellness(withPreset('gentle'));
    expect(flags.hidePostCounts).toBe(true);
    expect(flags.hideProfileCounts).toBe(false);
    expect(flags.noHoverCards).toBe(true);
  });

  it('an override beats the preset and marks the settings custom', () => {
    const settings = withFlag(withPreset('strong'), 'hideAnalytics', false);
    expect(effectiveWellness(settings).hideAnalytics).toBe(false);
    expect(effectiveWellness(settings).hideProfileCounts).toBe(true);
    expect(isCustomized(settings)).toBe(true);
  });

  it('moving a switch back to the preset value drops the override', () => {
    const moved = withFlag(withPreset('gentle'), 'hidePostCounts', false);
    const back = withFlag(moved, 'hidePostCounts', true);
    expect(back.overrides).toEqual({});
    expect(isCustomized(back)).toBe(false);
  });

  it('choosing a preset clears overrides', () => {
    const custom = withFlag(withPreset('off'), 'grayscale', true);
    expect(withPreset('gentle').overrides).toEqual({});
    expect(isCustomized(custom)).toBe(true);
  });

  it('normalizes junk from storage or a newer build', () => {
    expect(normalizeWellness(null)).toEqual({ preset: 'off', overrides: {} });
    expect(normalizeWellness('strong')).toEqual({ preset: 'off', overrides: {} });
    expect(
      normalizeWellness({
        preset: 'extreme',
        overrides: { grayscale: true, futureThing: true, hidePostCounts: 'yes' },
      }),
    ).toEqual({ preset: 'off', overrides: { grayscale: true } });
  });

  it('root attributes are all absent on Off', () => {
    const attrs = wellnessRootAttributes(effectiveWellness(DEFAULT_WELLNESS));
    expect(Object.values(attrs).some(Boolean)).toBe(false);
    const strong = wellnessRootAttributes(effectiveWellness(withPreset('strong')));
    expect(strong['data-wellness-post-counts']).toBe(true);
    expect(strong['data-wellness-profile-counts']).toBe(true);
  });

  it('engagement notifications are likes, boosts and follows on every network', () => {
    for (const type of ['favourite', 'reblog', 'follow', 'like', 'repost', 'reaction', 'renote']) {
      expect(isEngagementNotification(type)).toBe(true);
    }
    for (const type of ['mention', 'follow_request', 'quote', 'poll', 'reply', undefined, null]) {
      expect(isEngagementNotification(type)).toBe(false);
    }
  });
});
