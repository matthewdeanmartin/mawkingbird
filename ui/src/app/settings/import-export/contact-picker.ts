import { buildSearchableContact } from './contact-discovery';
import type { ContactParseResult, SearchableContact } from './contact-discovery';

/**
 * Reading contacts from the phone's own address book.
 *
 * ## What this is
 *
 * A second door into the contact search that already exists. The Google CSV
 * importer asks someone to export their contacts on a computer, find the file,
 * and upload it — several minutes and a desktop. On a phone this is one tap.
 * Everything after the tap is the same code: {@link buildSearchableContact}
 * derives the search terms, `ContactDiscovery` spends the budget, `rankMatch`
 * explains the signals, and the user clicks Follow.
 *
 * ## What it can and cannot do
 *
 * Name matching finds people whose names are distinctive and misses people whose
 * names are common. Someone looking for "Freedbling Flingerblam" gets a great
 * answer; someone looking for "John Doe" gets noise. That is not a reason to
 * withhold it — the same was true of every other correlation source in this
 * directory — but it *is* a reason that the results are ranked with explained
 * signals and that nothing is ever followed automatically. A bad guess costs the
 * reader a glance, because the only thing that acts on it is their own click.
 *
 * ## Availability
 *
 * The [Contact Picker API](https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API)
 * is Chrome on Android only — not desktop, and not iOS, where every browser is
 * WebKit underneath. It needs HTTPS, a top-level frame, and a user gesture; all
 * three hold here.
 *
 * The control is therefore rendered **only where it works**, rather than shown
 * disabled with an explanation. A button that can never do anything on this
 * device is noise, and the CSV importer beside it is the answer for everyone
 * else.
 *
 * ## Privacy
 *
 * The page never sees the address book. The picker is the browser's own UI and
 * returns only the entries the user tapped; permission is per-invocation, with
 * no standing grant. Nothing selected is persisted — not to `localStorage`, not
 * anywhere — so there is no record to leak and nothing to register in
 * `storage-registry.ts`. The only thing that leaves the browser is a search
 * term, to the user's own home server, exactly as typing a name into search
 * would.
 */

/** The subset of the Contact Picker API this file uses. */
interface ContactsManagerLike {
  select(
    properties: string[],
    options?: { multiple?: boolean },
  ): Promise<Record<string, unknown>[]>;
  getProperties?(): Promise<string[]>;
}

/** The properties worth asking for, in the order they are useful. */
const WANTED_PROPERTIES = ['name', 'email', 'tel'] as const;

/**
 * The most contacts one run will search for.
 *
 * Each contact costs up to two API calls against the home server, so twenty
 * selections is up to forty calls. The budget control on the page is the real
 * limit and the user can raise it; this cap exists so that a stray "select all"
 * on a thousand-entry address book does not queue two thousand searches before
 * anyone notices.
 */
export const MAX_PICKED_CONTACTS = 20;

/** Whether this browser can open a contact picker at all. */
export function contactPickerAvailable(nav: Navigator = navigator): boolean {
  return (
    typeof window !== 'undefined' && 'contacts' in nav && 'ContactsManager' in (window as object)
  );
}

/** How a picker attempt ended. */
export type ContactPickResult =
  | { kind: 'picked'; result: ContactParseResult }
  | { kind: 'cancelled' }
  | { kind: 'unsupported' }
  | { kind: 'failed'; message: string };

/**
 * Open the browser's contact picker and turn the selection into search rows.
 *
 * Returns `cancelled` for an empty selection, which is what the API gives when
 * someone dismisses the sheet — indistinguishable from picking nobody, and both
 * mean "do nothing", so they are one case.
 */
export async function pickContacts(nav: Navigator = navigator): Promise<ContactPickResult> {
  if (!contactPickerAvailable(nav)) {
    return { kind: 'unsupported' };
  }
  const manager = (nav as Navigator & { contacts: ContactsManagerLike }).contacts;

  // Asking for a property the device does not support throws and takes the whole
  // picker with it, so ask what is available first when the browser will say.
  let properties: string[] = [...WANTED_PROPERTIES];
  try {
    if (manager.getProperties) {
      const supported = await manager.getProperties();
      properties = WANTED_PROPERTIES.filter((property) => supported.includes(property));
    }
  } catch {
    // Fall through with the full list: the select() below reports the real
    // problem better than a guess made here would.
  }
  if (!properties.includes('name')) {
    // Without a name there is nothing to match on — email alone cannot be
    // searched, because Mastodon has no email lookup outside the admin API.
    return { kind: 'unsupported' };
  }

  let selected: Record<string, unknown>[];
  try {
    selected = await manager.select(properties, { multiple: true });
  } catch (cause) {
    // A refused permission and a broken picker both land here. Neither is worth
    // a stack trace in front of the reader.
    return { kind: 'failed', message: describePickerFailure(cause) };
  }

  if (!selected.length) {
    return { kind: 'cancelled' };
  }

  const capped = selected.slice(0, MAX_PICKED_CONTACTS);
  const contacts = capped.flatMap((entry, index) => {
    const contact = searchableFromPicked(entry, index + 1);
    return contact ? [contact] : [];
  });

  return {
    kind: 'picked',
    result: {
      contacts,
      total: selected.length,
      // Everything not searchable: no usable name, or trimmed by the cap. The
      // page reports this, because "I picked 30 and it searched 12" needs an
      // explanation on screen rather than in a console.
      skipped: selected.length - contacts.length,
    },
  };
}

/**
 * Turn one picked contact into a searchable one.
 *
 * The picker returns arrays for every property — a contact can have several
 * names, emails and numbers — and `name` entries are whole display names rather
 * than split fields. Splitting on whitespace is crude but it is what the CSV
 * path also ends up comparing: `rankMatch` looks for the first and last name
 * appearing in a display name, and a middle name simply does not participate.
 *
 * Phone numbers are deliberately **not** used as search terms. Mastodon has no
 * phone lookup, so a number is only ever noise in a query; they are dropped
 * here rather than carried around unused.
 */
function searchableFromPicked(
  entry: Record<string, unknown>,
  id: number,
): SearchableContact | null {
  const names = stringsFrom(entry['name']);
  const emails = stringsFrom(entry['email']);
  const full = names.find((value) => value.trim().length > 0) ?? '';
  const parts = full.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';

  return buildSearchableContact({
    id,
    firstName,
    middleName,
    lastName,
    emails,
    // Emails are scanned for handles the same way the CSV path scans its cells:
    // someone whose address book entry holds `@user@host` should be found by it
    // rather than by their name, because a handle is proof and a name is a guess.
    clueText: [...names, ...emails].join(' '),
  });
}

/** The picker hands back arrays, but a hostile or odd device may not. */
function stringsFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

function describePickerFailure(cause: unknown): string {
  const name = (cause as { name?: string } | null)?.name;
  if (name === 'SecurityError') {
    return 'Your browser would not open the contact picker here. It needs a secure connection and a direct tap.';
  }
  if (name === 'InvalidStateError') {
    return 'A contact picker is already open.';
  }
  return 'Your browser could not open the contact picker.';
}
