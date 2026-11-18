import { listZipEntries, readZipText } from './archive-zip';
import { archiveBaseName, CONTACTS_FILE, parseArchiveScript, PickedFile } from './unbird-archive';

/**
 * The address book Twitter kept, as a vCard file a phone can import.
 *
 * This is the only place `contact.js` is opened, and only when the reader
 * presses the button. Nothing is stored or sent: the file is read, turned into
 * a download, and dropped. Twitter keeps emails and phone numbers but no names,
 * so each card is named after its first email or number.
 */

export interface ArchiveContact {
  emails: string[];
  phones: string[];
}

export function parseContacts(text: string): ArchiveContact[] {
  const rows = parseArchiveScript(text);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: { contact?: { emails?: unknown; phoneNumbers?: unknown } }) => ({
      emails: strings(row.contact?.emails),
      phones: strings(row.contact?.phoneNumbers),
    }))
    .filter((contact) => contact.emails.length || contact.phones.length);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && !!item.trim())
    : [];
}

/** vCard text escaping (RFC 6350 §3.4). */
function escapeVcard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/[,;]/g, (char) => `\\${char}`)
    .replace(/\r?\n/g, '\\n');
}

/** vCard 3.0, the version phones import most reliably. CRLF line endings, as the format requires. */
export function contactsVcard(contacts: readonly ArchiveContact[]): string {
  return contacts
    .map((contact) => {
      const name = escapeVcard(contact.emails[0] ?? contact.phones[0]);
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${name}`,
        'N:;;;;',
        ...contact.emails.map((email) => `EMAIL;TYPE=INTERNET:${escapeVcard(email)}`),
        ...contact.phones.map((phone) => `TEL:${escapeVcard(phone)}`),
        'NOTE:From a Twitter archive',
        'END:VCARD',
      ].join('\r\n');
    })
    .join('\r\n')
    .concat('\r\n');
}

/** Find and read `contact.js` in what the reader picked; null when it is not there. */
export async function readContacts(
  picked: readonly PickedFile[],
): Promise<ArchiveContact[] | null> {
  for (const file of picked) {
    if (file.path.toLowerCase().endsWith('.zip')) {
      const entry = (await listZipEntries(file.blob)).find(
        (item) => archiveBaseName(item.name) === CONTACTS_FILE,
      );
      if (entry) return parseContacts(await readZipText(file.blob, entry));
    } else if (archiveBaseName(file.path) === CONTACTS_FILE) {
      return parseContacts(await file.blob.text());
    }
  }
  return null;
}
