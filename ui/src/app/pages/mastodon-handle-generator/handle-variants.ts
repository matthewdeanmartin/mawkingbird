/**
 * Handle suggestions from a name, within Mastodon's rules for a local account:
 * letters, digits and underscore only, at most 30 characters
 * (`Account::USERNAME_LENGTH_LIMIT`, local username format).
 *
 * Usernames are unique regardless of case, so `MatthewMartin` and
 * `matthewmartin` are the same handle; suggestions are lower-case.
 */

export const MAX_HANDLE_LENGTH = 30;

/** At most this many suggestions, so a run stays a few requests per server. */
export const MAX_SUGGESTIONS = 12;

/**
 * The words of a name, folded to plain lower-case letters and digits.
 * Accents are dropped (José → jose); anything else separates words.
 */
export function nameWords(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Whether a string is a valid local Mastodon username. */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]+$/i.test(handle) && handle.length <= MAX_HANDLE_LENGTH;
}

/**
 * Handles to try for a name, most natural first.
 *
 * The plain forms come first (`matthewmartin`, `matthew_martin`), then
 * shortened ones (`mmartin`, `matthewm`), the reversed order, the prefixes
 * people reach for when their name is taken (`its`, `real`, `the`), and a
 * number last, since a number is the least memorable fix.
 */
export function handleVariants(name: string): string[] {
  const words = nameWords(name);
  if (!words.length) return [];
  const [first] = words;
  const last = words.length > 1 ? words[words.length - 1] : '';
  const joined = words.join('');
  const candidates: string[] = [joined];
  if (last) {
    candidates.push(
      words.join('_'),
      `${first[0]}${last}`,
      `${first[0]}_${last}`,
      `${first}${last[0]}`,
      `${first}_${last[0]}`,
      `${last}${first}`,
      `${last}_${first}`,
    );
  }
  candidates.push(`its${joined}`, `real${joined}`, `the${joined}`, `${joined}_`, `${joined}1`);
  if (last) candidates.push(first, last);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    const handle = candidate.slice(0, MAX_HANDLE_LENGTH);
    // A one- or two-letter handle is never free on a big server and never
    // what someone typing their name meant.
    if (handle.length < 3 || seen.has(handle) || !isValidHandle(handle)) continue;
    seen.add(handle);
    out.push(handle);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}
