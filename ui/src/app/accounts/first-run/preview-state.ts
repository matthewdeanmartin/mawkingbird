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
  /** The public page the front door was opened from, for the way back. */
  from?: PreviewOrigin;
}

/** A page of this app: its path and query, and its title as the visitor saw it. */
export interface PreviewOrigin {
  url: string;
  title: string;
}

/** A stored origin, only if it is a path in this app. */
function previewOrigin(value: unknown): PreviewOrigin | undefined {
  const { url, title } = (value ?? {}) as Record<string, unknown>;
  return typeof url === 'string' && /^\/[^/\\]/.test(url) && typeof title === 'string' && title
    ? { url, title }
    : undefined;
}

/** The stored preview, or null when none is running or storage is unreadable. */
export function readPreviewState(): PreviewState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREVIEW_KEY) ?? 'null') as {
      server?: unknown;
      preexisting?: unknown;
      from?: unknown;
    } | null;
    if (typeof parsed?.server !== 'string') {
      return null;
    }
    const preexisting = Array.isArray(parsed.preexisting)
      ? parsed.preexisting.filter((id): id is string => typeof id === 'string')
      : [];
    const from = previewOrigin(parsed.from);
    return { server: parsed.server, preexisting, ...(from && { from }) };
  } catch {
    return null;
  }
}
