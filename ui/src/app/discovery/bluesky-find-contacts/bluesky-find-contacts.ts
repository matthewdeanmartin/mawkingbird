import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MbNotice } from '../../design-system/notice/notice';
import { MbPageHeader, MbSection } from '../../design-system/page-header/page-header';
import { BlueskyContactApi } from '../../connections/bluesky/bluesky-contact-api';
import {
  CONTACT_COUNTRIES,
  contactNumbers,
  phonesFromText,
  phonesFromVcard,
  toE164,
} from '../../connections/bluesky/bluesky-contacts';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BskyProfile } from '../../connections/bluesky/bluesky-types';
import { AppDialogs } from '../../shell/app-dialogs';
import { BlueskyPeopleList } from '../bluesky-starter-packs/bluesky-people-list';

// i18n bskyContacts.title: Find people you know on Bluesky
// i18n bskyContacts.intro: Bluesky can find people whose phone numbers are in your contacts, if they also looked for you. You confirm your own number first.
// i18n bskyContacts.privacy: The numbers go to Bluesky, which keeps them scrambled (hashed) to find matches and never shows them to anyone. You can remove them below at any time.
// i18n bskyContacts.notLinked: Link a Bluesky account to find people you know.
// i18n bskyContacts.link: Link Bluesky
// i18n bskyContacts.matches: People you know ({{count}})
// i18n bskyContacts.noMatches: No matches yet. People appear here once they also look for you.
// i18n bskyContacts.lastSync: Last checked {{date}}.
// i18n bskyContacts.verifyTitle: Your phone number
// i18n bskyContacts.country: Country
// i18n bskyContacts.phone: Phone number
// i18n bskyContacts.sendCode: Text me a code
// i18n bskyContacts.code: Code from the text message
// i18n bskyContacts.verify: Confirm
// i18n bskyContacts.badPhone: That doesn't look like a phone number for {{country}}.
// i18n bskyContacts.verifyFailed: Bluesky couldn't confirm that number. Check the code, or ask for a new one.
// i18n bskyContacts.sendFailed: Bluesky couldn't send a code to that number.
// i18n bskyContacts.contactsTitle: Your contacts
// i18n bskyContacts.contactsHint: Pick contacts, open an exported contacts file (vCard or CSV), or paste numbers. Local numbers are read as {{country}}.
// i18n bskyContacts.pick: Choose from my contacts
// i18n bskyContacts.file: Contacts file
// i18n bskyContacts.paste: Or paste numbers
// i18n bskyContacts.ready.one: {{count}} number ready.
// i18n bskyContacts.ready.other: {{count}} numbers ready.
// i18n bskyContacts.import: Find them on Bluesky
// i18n bskyContacts.importFailed: Bluesky couldn't check these numbers. Try again.
// i18n bskyContacts.remove: Remove my contact data from Bluesky
// i18n bskyContacts.removeConfirm: Remove the numbers you imported and every match from Bluesky? People already followed stay followed.
// i18n bskyContacts.removed: Your contact data was removed from Bluesky.

/** The Contact Picker API, where a browser has it (Chromium on Android). */
interface ContactsManager {
  select(properties: 'tel'[], options: { multiple: boolean }): Promise<{ tel?: string[] }[]>;
}

/**
 * Find people you know on Bluesky (spec/bsky_parity.md sprint 8). bsky.app
 * offers this only in its phone apps; a browser cannot read the address book,
 * so contacts come from the Contact Picker where it exists, an exported vCard
 * or CSV, or pasted numbers. Nothing is sent until the reader has confirmed
 * their own number and asked to look.
 */
@Component({
  selector: 'app-bluesky-find-contacts',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbPageHeader,
    MbSection,
    MbField,
    MbControl,
    MbButton,
    MbNotice,
    MbContentState,
    MbContentLink,
    BlueskyPeopleList,
  ],
  templateUrl: './bluesky-find-contacts.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './bluesky-find-contacts.css',
})
export class BlueskyFindContacts implements OnInit {
  protected session = inject(BlueskySession);
  private contacts = inject(BlueskyContactApi);
  private dialogs = inject(AppDialogs);
  private i18n = inject(TranslocoService);

  protected readonly countries = CONTACT_COUNTRIES;
  protected readonly canPick =
    typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

  protected country = signal(defaultCountry());
  protected phone = signal('');
  protected code = signal('');
  protected codeSent = signal(false);
  protected token = signal<string | null>(null);
  protected verifiedPhone = signal('');
  protected rawContacts = signal<string[]>([]);
  protected pasted = signal('');
  protected matches = signal<BskyProfile[]>([]);
  protected lastSync = signal<string | null>(null);
  protected busy = signal(false);
  protected error = signal('');
  protected notice = signal('');

  protected countryName = computed(
    () => CONTACT_COUNTRIES.find((c) => c.code === this.country())?.name ?? this.country(),
  );
  protected numbers = computed(() =>
    contactNumbers(
      [...this.rawContacts(), ...phonesFromText(this.pasted())],
      this.country(),
      this.verifiedPhone(),
    ),
  );

  ngOnInit(): void {
    if (this.session.linked()) void this.loadExisting();
  }

  private async loadExisting(): Promise<void> {
    try {
      const [status, matches] = await Promise.all([
        this.contacts.status(),
        this.contacts.matches(),
      ]);
      this.lastSync.set(status?.syncedAt ?? null);
      this.matches.set(matches);
    } catch {
      // Nothing imported yet, or the service is unavailable: the steps still work.
    }
  }

  protected lastSyncText(): string {
    const at = this.lastSync();
    return at
      ? this.i18n.translate('bskyContacts.lastSync', { date: new Date(at).toLocaleDateString() })
      : '';
  }

  protected async sendCode(): Promise<void> {
    const phone = toE164(this.phone(), this.country());
    if (!phone) {
      this.error.set(this.i18n.translate('bskyContacts.badPhone', { country: this.countryName() }));
      return;
    }
    await this.run(async () => {
      await this.contacts.startVerification(phone);
      this.verifiedPhone.set(phone);
      this.codeSent.set(true);
    }, 'bskyContacts.sendFailed');
  }

  protected async verify(): Promise<void> {
    await this.run(async () => {
      this.token.set(await this.contacts.verify(this.verifiedPhone(), this.code()));
    }, 'bskyContacts.verifyFailed');
  }

  protected async pick(): Promise<void> {
    const manager = (navigator as unknown as { contacts?: ContactsManager }).contacts;
    if (!manager) return;
    try {
      const chosen = await manager.select(['tel'], { multiple: true });
      this.rawContacts.update((list) => [...list, ...chosen.flatMap((c) => c.tel ?? [])]);
    } catch {
      // The reader closed the picker.
    }
  }

  protected async readFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const found = /BEGIN:VCARD/i.test(text) ? phonesFromVcard(text) : phonesFromText(text);
    this.rawContacts.update((list) => [...list, ...found]);
  }

  protected async importContacts(): Promise<void> {
    const token = this.token();
    const numbers = this.numbers();
    if (!token || !numbers.length) return;
    await this.run(async () => {
      const found = await this.contacts.importContacts(token, numbers);
      const known = new Set(this.matches().map((m) => m.did));
      this.matches.update((list) => [...list, ...found.filter((m) => !known.has(m.did))]);
      this.lastSync.set(new Date().toISOString());
      // A token opens one import; the numbers are not kept here either.
      this.rawContacts.set([]);
      this.pasted.set('');
    }, 'bskyContacts.importFailed');
  }

  protected async removeData(): Promise<void> {
    if (!(await this.dialogs.confirm(this.i18n.translate('bskyContacts.removeConfirm')))) return;
    await this.run(async () => {
      await this.contacts.removeData();
      this.matches.set([]);
      this.lastSync.set(null);
      this.notice.set(this.i18n.translate('bskyContacts.removed'));
    }, 'bskyContacts.importFailed');
  }

  private async run(change: () => Promise<void>, failureKey: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await change();
    } catch {
      this.error.set(this.i18n.translate(failureKey));
    } finally {
      this.busy.set(false);
    }
  }
}

/** The reader's country from the browser language, when it is one Bluesky offers. */
function defaultCountry(): string {
  const region = (typeof navigator !== 'undefined' ? navigator.language : '')
    .split(/[-_]/)[1]
    ?.toUpperCase();
  return CONTACT_COUNTRIES.some((c) => c.code === region) ? region! : 'US';
}
