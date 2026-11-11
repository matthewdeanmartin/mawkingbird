/**
 * Marks the anonymous account as being mid-preview.
 *
 * The preview enters Anonymous *before* the visitor has chosen anything, so
 * "does an anonymous account exist" can no longer answer "has this person
 * decided". A reload with the modal open would otherwise look exactly like a
 * returning anonymous user and skip the question forever, leaving follows
 * nobody asked for. This flag is the difference, and it is cleared by the same
 * call that removes the seed.
 *
 * Kept apart from PreviewSeed so root code (the title strategy) can ask whether
 * a preview is running without importing the API layer.
 */
export const PREVIEW_KEY = 'mockingbird_first_run_preview';

export interface PreviewState {
  server: string;
  preexisting: string[];
}

/** The stored preview, or null when none is running or storage is unreadable. */
export function readPreviewState(): PreviewState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREVIEW_KEY) ?? 'null') as {
      server?: unknown;
      preexisting?: unknown;
    } | null;
    if (typeof parsed?.server !== 'string') {
      return null;
    }
    const preexisting = Array.isArray(parsed.preexisting)
      ? parsed.preexisting.filter((id): id is string => typeof id === 'string')
      : [];
    return { server: parsed.server, preexisting };
  } catch {
    return null;
  }
}
