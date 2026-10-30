import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { accountProfilePath } from '../../../account-route';
import { MbButton } from '../../../design-system/button/button';
import { ContactDiscovery } from './contact-discovery';
import { contactPickerAvailable, pickContacts } from './contact-picker';

// i18n settings.importExport.contacts.callsUsed: API calls used
// i18n settings.importExport.contacts.chooseCsv: Choose contacts CSV…
// i18n settings.importExport.contacts.clues.one: {{count}} matching clue
// i18n settings.importExport.contacts.clues.other: {{count}} matching clues
// i18n settings.importExport.contacts.intro: Look for the people in your contacts through your home server. Your contacts stay in this browser; only derived search terms are sent to your server. Nobody is followed automatically. Names, usernames, domains, and profile links are clues—not proof of identity.
// i18n settings.importExport.contacts.loadedNote: only in this browser.
// i18n settings.importExport.contacts.noCandidate: searched contacts had no candidate match:
// i18n settings.importExport.contacts.pick: Pick from my contacts…
// i18n settings.importExport.contacts.pickedNote: Picked from your contacts. Nothing was saved — closing this page forgets them.
// i18n settings.importExport.contacts.pickerNote: On this phone you can pick contacts directly — no export, no file. Your browser shows the picker and this page only ever sees the people you tap.
// i18n settings.importExport.contacts.readyToSearch: contacts ready to search
// i18n settings.importExport.contacts.skipped.a: skipped because they had no full person name or Mastodon handle. Up to
// i18n settings.importExport.contacts.skipped.b: calls total; this run stops at
// i18n settings.importExport.contacts.title: Find contacts on Mastodon

/**
 * Find the people in your contacts on Mastodon: from the phone's own contact
 * picker where the browser has one (Chrome on Android), or from a Google
 * Contacts CSV everywhere. Searching spends a budget the reader sets; following
 * is one tap per match, never in bulk, because these are name guesses.
 *
 * Shared by Settings → Import/Export and the /find-contacts-on-mastodon tool
 * page. Work and results live in the root-provided {@link ContactDiscovery}.
 */
@Component({
  selector: 'app-contact-friends-import',
  imports: [FormsModule, RouterLink, TranslocoPipe, MbButton],
  templateUrl: './contact-friends-import.html',
  styleUrl: './friend-finder.css',
})
export class ContactFriendsImport {
  protected readonly accountProfilePath = accountProfilePath;
  protected contactDiscovery = inject(ContactDiscovery);

  protected contactFileName = signal<string | null>(null);
  protected contactCallLimit = signal(20);

  protected contactMisses = computed(() =>
    this.contactDiscovery
      .rows()
      .filter((row) => row.status === 'complete' && row.matches.length === 0)
      .map((row) => row.contact.name),
  );

  protected onContactFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.contactFileName.set(file.name);
    this.contactPickerError.set(null);
    file.text().then((text) => this.contactDiscovery.load(text));
    input.value = '';
  }

  /**
   * Whether to offer the phone's own contact picker.
   *
   * Read once at construction rather than per-render: the answer is a property
   * of the browser and cannot change while the page is open.
   */
  protected readonly canPickContacts = contactPickerAvailable();

  /** A picker failure worth showing, or null. Cleared by the next attempt. */
  protected readonly contactPickerError = signal<string | null>(null);

  /**
   * Open the phone's contact picker and search for whoever was chosen.
   *
   * Everything downstream is the CSV path's code — the picker only supplies the
   * contacts. Deliberately does **not** start searching on its own: the budget
   * control sits right there and spending someone's API calls without a second
   * tap would be the app deciding how much to spend on their behalf.
   */
  protected async pickPhoneContacts(): Promise<void> {
    this.contactPickerError.set(null);
    const outcome = await pickContacts();
    switch (outcome.kind) {
      case 'picked':
        // Replaces whatever a CSV had loaded, exactly as choosing a second CSV
        // would. Two contact sets merged into one list would make the counts on
        // screen unexplainable.
        this.contactFileName.set(null);
        this.contactDiscovery.loadContacts(outcome.result);
        break;
      case 'failed':
        this.contactPickerError.set(outcome.message);
        break;
      case 'unsupported':
        this.contactPickerError.set('This browser cannot open a contact picker.');
        break;
      case 'cancelled':
        // Nothing chosen, nothing to say.
        break;
    }
  }

  protected startContactSearch(): void {
    void this.contactDiscovery.start(this.contactCallLimit());
  }

  protected setContactCallLimit(value: number | string): void {
    const parsed = Number(value);
    this.contactCallLimit.set(
      Number.isFinite(parsed) ? Math.min(1000, Math.max(1, Math.floor(parsed))) : 20,
    );
  }

  protected clearContactSearch(): void {
    this.contactFileName.set(null);
    this.contactPickerError.set(null);
    this.contactDiscovery.reset();
  }

  protected contactStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'waiting';
      case 'searching':
        return 'searching…';
      case 'complete':
        return 'searched';
      default:
        return 'failed';
    }
  }
}
