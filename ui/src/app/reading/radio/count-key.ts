/**
 * The `.one` or `.other` key for a count: the app's plural convention, where a
 * dictionary has `base.one` and `base.other` entries for each counted string.
 */
export function countKey(base: string, count: number): string {
  return `${base}.${count === 1 ? 'one' : 'other'}`;
}
