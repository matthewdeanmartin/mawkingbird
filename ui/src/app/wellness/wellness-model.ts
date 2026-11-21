/**
 * Wellness: what the app measures, shows and invites — the pure part.
 *
 * Not Zen. Zen is a layout (rails hidden, reading and writing zen). Wellness
 * decides whether numbers are shown, which notifications arrive, which
 * discovery surfaces are open, and how long a sitting runs. The two can be on
 * together. See spec/sprint/wellness-2026-11.md.
 *
 * ## Presets and overrides
 *
 * The stored record is a preset plus overrides, not a flat list of booleans.
 * Off is the default for everyone (owner, 2026-11-20). A preset is a bundle;
 * an override is a switch the person moved away from that bundle, and choosing
 * a preset again clears them. Storing the preset (rather than expanding it into
 * booleans at choice time) means a later release can add a protection to
 * Strong and people on Strong get it, while their explicit choices still win.
 *
 * The record lives inside the `mockingbird_client_prefs` blob, so it rides
 * along with Plus settings sync like every other client preference.
 */

export type WellnessPreset = 'off' | 'gentle' | 'strong';

export const WELLNESS_PRESETS: readonly WellnessPreset[] = ['off', 'gentle', 'strong'];

/** Every individual protection. Order is the order the settings page lists them. */
export const WELLNESS_KEYS = [
  'hidePostCounts',
  'hideProfileCounts',
  'noHoverCards',
  'limitedNotifications',
  'hideReplyGuys',
  'hideAnalytics',
  'forceCalm',
  'demoteGoodStuff',
  'discoveryWindows',
  'checkIn',
  'breakReminders',
  'autoGrayscale',
  'grayscale',
] as const;

export type WellnessKey = (typeof WELLNESS_KEYS)[number];

export type WellnessFlags = Record<WellnessKey, boolean>;

export interface WellnessSettings {
  preset: WellnessPreset;
  overrides: Partial<WellnessFlags>;
}

export const DEFAULT_WELLNESS: WellnessSettings = { preset: 'off', overrides: {} };

const NONE: WellnessFlags = Object.fromEntries(
  WELLNESS_KEYS.map((key) => [key, false]),
) as WellnessFlags;

const GENTLE: WellnessFlags = {
  ...NONE,
  hidePostCounts: true,
  noHoverCards: true,
  demoteGoodStuff: true,
};

/**
 * Manual grayscale is deliberately absent from every preset: it is a "right
 * now" choice, while the presets describe a standing posture. Strong turns on
 * the automatic version instead.
 *
 * Hiding reply guys is absent too: removing people outright, rather than
 * putting a click in front of them, is the reader's call to make by name
 * (owner, 2026-11-21), not something a level switches on for them.
 */
const STRONG: WellnessFlags = {
  ...GENTLE,
  hideProfileCounts: true,
  limitedNotifications: true,
  hideAnalytics: true,
  forceCalm: true,
  discoveryWindows: true,
  checkIn: true,
  breakReminders: true,
  autoGrayscale: true,
};

export const PRESET_FLAGS: Record<WellnessPreset, Readonly<WellnessFlags>> = {
  off: NONE,
  gentle: GENTLE,
  strong: STRONG,
};

function isPreset(value: unknown): value is WellnessPreset {
  return typeof value === 'string' && (WELLNESS_PRESETS as readonly string[]).includes(value);
}

function isKey(value: string): value is WellnessKey {
  return (WELLNESS_KEYS as readonly string[]).includes(value);
}

/**
 * A stored record made safe. Unknown presets fall back to Off and unknown or
 * non-boolean overrides are dropped, so a newer build's key can't crash an
 * older one. An override that equals its preset's value is dropped too: it
 * isn't a deviation, and keeping it would show "Custom" for nothing.
 */
export function normalizeWellness(value: unknown): WellnessSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_WELLNESS, overrides: {} };
  }
  const record = value as { preset?: unknown; overrides?: unknown };
  const preset = isPreset(record.preset) ? record.preset : 'off';
  const overrides: Partial<WellnessFlags> = {};
  if (record.overrides && typeof record.overrides === 'object') {
    for (const [key, flag] of Object.entries(record.overrides as Record<string, unknown>)) {
      if (isKey(key) && typeof flag === 'boolean' && flag !== PRESET_FLAGS[preset][key]) {
        overrides[key] = flag;
      }
    }
  }
  return { preset, overrides };
}

/** The value each protection actually has: the override if any, else the preset's. */
export function effectiveWellness(settings: WellnessSettings): WellnessFlags {
  const base = PRESET_FLAGS[settings.preset];
  const flags = { ...base };
  for (const key of WELLNESS_KEYS) {
    const override = settings.overrides[key];
    if (typeof override === 'boolean') {
      flags[key] = override;
    }
  }
  return flags;
}

/** Choosing a preset is a fresh start: overrides are cleared. */
export function withPreset(preset: WellnessPreset): WellnessSettings {
  return { preset, overrides: {} };
}

/** Move one switch. Returns to the preset's value drop the override. */
export function withFlag(
  settings: WellnessSettings,
  key: WellnessKey,
  on: boolean,
): WellnessSettings {
  return normalizeWellness({
    preset: settings.preset,
    overrides: { ...settings.overrides, [key]: on },
  });
}

/** True when any switch differs from the preset: shown as "Custom (from Strong)". */
export function isCustomized(settings: WellnessSettings): boolean {
  return Object.keys(settings.overrides).length > 0;
}

/**
 * Root `<html>` attributes for protections that are pure presentation, so
 * global CSS can apply them to every surface without wiring each component
 * (the same approach as `data-images`). Value-less attributes are absent when
 * off, so nothing changes for someone on Off.
 */
export function wellnessRootAttributes(flags: WellnessFlags): Record<string, boolean> {
  return {
    'data-wellness-post-counts': flags.hidePostCounts,
    'data-wellness-profile-counts': flags.hideProfileCounts,
    'data-wellness-grayscale': flags.grayscale,
  };
}

/**
 * Notification types that are engagement rather than conversation: someone
 * liked, boosted or followed. Limited notifications drops exactly these, the
 * Tusky/Pachli definition, and keeps replies, mentions, quotes, follow requests
 * (a decision is waiting) and account-safety notices.
 *
 * Mastodon names plus the raw Bluesky reasons and Misskey types, so a path
 * that sees an unadapted row still classifies it.
 */
const ENGAGEMENT_TYPES: ReadonlySet<string> = new Set([
  'favourite',
  'reblog',
  'follow',
  // Bluesky reasons
  'like',
  'repost',
  'like-via-repost',
  'repost-via-repost',
  // Misskey
  'reaction',
  'renote',
]);

export function isEngagementNotification(type: string | undefined | null): boolean {
  return !!type && ENGAGEMENT_TYPES.has(type);
}
