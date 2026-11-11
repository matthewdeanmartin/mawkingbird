import { MediaAttachment } from '../../platform/api/models';

/**
 * Mastodon focal points: `x` and `y` in [-1, 1], centre at 0,0, with `y`
 * pointing UP (so the top edge is y = 1). Thumbnails crop around this point
 * instead of the middle, so a face near the top is not cut off.
 */
export interface FocalPoint {
  x: number;
  y: number;
}

export const CENTRE: FocalPoint = { x: 0, y: 0 };

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Two decimals, as Mastodon's own composer sends it. */
function round(value: number): number {
  return Math.round(clamp(value) * 100) / 100;
}

/** The author's focal point, if the attachment has one. */
export function focalPointOf(media: Pick<MediaAttachment, 'meta'>): FocalPoint | null {
  const focus = (media.meta as { focus?: { x?: number; y?: number } } | undefined)?.focus;
  if (!focus || typeof focus.x !== 'number' || typeof focus.y !== 'number') return null;
  return { x: clamp(focus.x), y: clamp(focus.y) };
}

/**
 * CSS `object-position` that keeps the focal point in view when the image is
 * cropped with `object-fit: cover`. Null leaves the browser's centre default.
 */
export function objectPosition(point: FocalPoint | null): string | null {
  if (!point || (point.x === 0 && point.y === 0)) return null;
  const left = ((clamp(point.x) + 1) / 2) * 100;
  const top = ((1 - clamp(point.y)) / 2) * 100;
  return `${left.toFixed(1)}% ${top.toFixed(1)}%`;
}

/** A click on the uncropped image, as a focal point. */
export function pointFromClick(event: MouseEvent, image: Element): FocalPoint {
  const box = image.getBoundingClientRect();
  if (!box.width || !box.height) return CENTRE;
  const fx = (event.clientX - box.left) / box.width;
  const fy = (event.clientY - box.top) / box.height;
  return { x: round(fx * 2 - 1), y: round(1 - fy * 2) };
}

/** Nudge with the keyboard; a tenth of the way per press. */
export function nudge(point: FocalPoint, key: string): FocalPoint | null {
  const step = 0.1;
  switch (key) {
    case 'ArrowLeft':
      return { x: round(point.x - step), y: point.y };
    case 'ArrowRight':
      return { x: round(point.x + step), y: point.y };
    case 'ArrowUp':
      return { x: point.x, y: round(point.y + step) };
    case 'ArrowDown':
      return { x: point.x, y: round(point.y - step) };
    default:
      return null;
  }
}

/** The `focus` value Mastodon's media endpoints take: "x,y". */
export function focusParam(point: FocalPoint): string {
  return `${round(point.x)},${round(point.y)}`;
}

export function samePoint(a: FocalPoint | null, b: FocalPoint | null): boolean {
  const pa = a ?? CENTRE;
  const pb = b ?? CENTRE;
  return round(pa.x) === round(pb.x) && round(pa.y) === round(pb.y);
}
