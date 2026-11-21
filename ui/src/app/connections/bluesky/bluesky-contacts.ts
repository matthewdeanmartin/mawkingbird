/**
 * Find contacts on Bluesky (`app.bsky.contact.*`, spec/bsky_parity.md sprint
 * 8): the pure parts. Bluesky matches phone numbers in E.164 form, only between
 * people who both imported each other, after the reader verified their own
 * number by SMS. This module turns what a browser can get (the Contact Picker,
 * a vCard or CSV export, pasted text) into those numbers.
 */

/** bsky.app's countries for this feature, with their calling codes. */
export const CONTACT_COUNTRIES: readonly { code: string; name: string; dial: string }[] = [
  { code: 'US', name: 'United States', dial: '1' },
  { code: 'CA', name: 'Canada', dial: '1' },
  { code: 'GB', name: 'United Kingdom', dial: '44' },
  { code: 'AU', name: 'Australia', dial: '61' },
  { code: 'BR', name: 'Brazil', dial: '55' },
  { code: 'DE', name: 'Germany', dial: '49' },
  { code: 'ES', name: 'Spain', dial: '34' },
  { code: 'FR', name: 'France', dial: '33' },
  { code: 'IT', name: 'Italy', dial: '39' },
  { code: 'JP', name: 'Japan', dial: '81' },
  { code: 'KR', name: 'South Korea', dial: '82' },
  { code: 'NL', name: 'Netherlands', dial: '31' },
  { code: 'SE', name: 'Sweden', dial: '46' },
];

/** One import sends at most this many numbers (the lexicon's limit). */
export const MAX_CONTACTS_PER_IMPORT = 1000;

/**
 * A phone number in E.164 (`+<country><number>`), or null when it can't be
 * one. A number written with `+` or `00` keeps its own country; a local one
 * takes the reader's country and loses its trunk `0` (Italy keeps it, as its
 * numbers are dialled with it). Without a full numbering plan this does not
 * validate lengths beyond E.164's 8–15 digits; Bluesky ignores numbers that
 * match nobody.
 */
export function toE164(raw: string, country: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dial = CONTACT_COUNTRIES.find((c) => c.code === country)?.dial;
  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1).replace(/\+/g, '');
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else {
    if (!dial) return null;
    let local = digits.replace(/\+/g, '');
    if (dial === '1' && local.length === 11 && local.startsWith('1')) local = local.slice(1);
    else if (country !== 'IT') local = local.replace(/^0+/, '');
    digits = `${dial}${local}`;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

/** Phone numbers in a vCard file (TEL properties), in order. */
export function phonesFromVcard(text: string): string[] {
  // Unfold continuation lines first (RFC 6350 §3.2).
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out: string[] = [];
  for (const line of unfolded.split(/\r?\n/)) {
    const match = /^(?:item\d+\.)?TEL(?:;[^:]*)?:(.*)$/i.exec(line.trim());
    if (match) out.push(match[1].replace(/^tel:/i, '').trim());
  }
  return out;
}

/** Phone-looking runs in any text: a CSV export, or numbers pasted one per line. */
export function phonesFromText(text: string): string[] {
  // Spaces and tabs only: a newline separates two numbers, never joins them.
  return (text.match(/(?:\+|00)?\d[\d \t().-]{6,}\d/g) ?? []).map((s) => s.trim());
}

/**
 * Numbers ready to import: normalized, the reader's own number left out,
 * duplicates dropped, at most one import's worth.
 */
export function contactNumbers(raw: readonly string[], country: string, own: string): string[] {
  const seen = new Set<string>([own]);
  const out: string[] = [];
  for (const value of raw) {
    const number = toE164(value, country);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    out.push(number);
    if (out.length === MAX_CONTACTS_PER_IMPORT) break;
  }
  return out;
}
