import { DEFAULT_BASE, normalizeBase } from './links.js';

/**
 * The one setting: which Mawkingbird the extension opens. Stored in the
 * extension's own `storage.local`, never in mawkingbird.com's storage.
 */
const BASE_KEY = 'mawkingbirdBase';

export async function getBase() {
  try {
    const stored = await browser.storage.local.get(BASE_KEY);
    return normalizeBase(stored[BASE_KEY]) ?? DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

/** Saves `value` when it is a usable base; returns the saved base or null. */
export async function setBase(value) {
  const base = normalizeBase(value);
  if (!base) return null;
  await browser.storage.local.set({ [BASE_KEY]: base });
  return base;
}

/** Calls `listener(base)` whenever the setting changes. */
export function onBaseChanged(listener) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && BASE_KEY in changes) {
      listener(normalizeBase(changes[BASE_KEY].newValue) ?? DEFAULT_BASE);
    }
  });
}
