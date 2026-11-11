import { Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Palette for generated avatars. Picked for legibility against white text at
 * 38px, and kept small so a collection of two dozen people reads as a set
 * rather than a paint chart.
 */
const COLORS = [
  '#4c6ef5',
  '#7048e8',
  '#c2255c',
  '#e8590c',
  '#2b8a3e',
  '#0b7285',
  '#5f3dc4',
  '#a61e4d',
  '#495057',
  '#1864ab',
];

/** Stable, order-independent hash. Same handle always gets the same color. */
function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * The one or two characters to draw. Prefers the display name's initials, since
 * that is the name a reader recognises, and falls back to the handle.
 *
 * `Array.from` rather than indexing: an emoji or a non-BMP character as the
 * first "letter" of a display name would otherwise be sliced in half and render
 * as a replacement glyph.
 */
function initials(label: string): string {
  const words = label
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!words.length) {
    return '?';
  }
  const first = Array.from(words[0])[0] ?? '?';
  if (words.length === 1) {
    return first.toUpperCase();
  }
  const second = Array.from(words[words.length - 1])[0] ?? '';
  return (first + second).toUpperCase();
}

/**
 * An inline SVG data URI. Inline because the whole point is to work when the
 * network does not: a fallback that needed fetching would fail in exactly the
 * situation it exists for.
 */
export function initialsAvatar(label: string): string {
  const text = initials(label);
  const color = COLORS[hash(label.toLowerCase()) % COLORS.length];
  // Font size shrinks for two letters so both fit inside the circle.
  const size = text.length > 1 ? 34 : 44;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" fill="${color}"/>` +
    `<text x="50" y="50" fill="#fff" font-family="system-ui,sans-serif" font-size="${size}" ` +
    `font-weight="600" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Draw initials when an avatar image fails to load.
 *
 * Written for the bundled collections and starter kits, whose avatars are
 * absolute `files.mastodon.social` URLs frozen into the snapshot. That CDN is
 * blocked on a good number of school, office and national networks — and when
 * it is, every member of every bundled collection renders as a broken-image
 * icon, which makes the curated sets this app ships look broken rather than
 * blocked.
 *
 * A generated avatar is used rather than a single grey silhouette because these
 * lists are read as *groups of people*: two dozen identical placeholders lose
 * the one thing the row was carrying, which is that these are distinct
 * individuals. Colour comes from the handle, so the same person looks the same
 * everywhere in the app.
 *
 * Applied to the `<img>` itself rather than swapping in a different element, so
 * it inherits the existing size, shape and CSS with no layout shift.
 */
@Directive({
  selector: 'img[appAvatarFallback]',
  host: {
    '(error)': 'onError()',
  },
})
export class AvatarFallback {
  private readonly element = inject<ElementRef<HTMLImageElement>>(ElementRef);

  /** Name to derive initials and colour from — display name or handle. */
  readonly appAvatarFallback = input('');

  /** Guards against a loop if the generated URI itself somehow errored. */
  private applied = false;

  protected onError(): void {
    if (this.applied) {
      return;
    }
    this.applied = true;
    this.element.nativeElement.src = initialsAvatar(this.appAvatarFallback() || '?');
  }
}
