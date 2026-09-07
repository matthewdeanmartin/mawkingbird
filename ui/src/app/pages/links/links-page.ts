import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HumanTimePipe } from '../../human-time.pipe';
import { CorsProxy } from '../../providers/cors-proxy/cors-proxy';
import { CorsProxyEntry } from '../../providers/cors-proxy/cors-proxy-catalog';
import { ProxyConsentDialog } from '../../providers/shortener/proxy-consent-dialog/proxy-consent-dialog';
import { ShortenerProxyConsent } from '../../providers/shortener/proxy-consent';
import { ShortenerCatalogEntry, shortenerEntry } from '../../providers/shortener/shortener-catalog';
import { linkKind, ShortLinkRecord } from '../../providers/shortener/shortener-history';
import { ShortenerRegistry } from '../../providers/shortener/shortener-registry';
import { ShortenerSettings } from '../../providers/shortener/shortener-settings';
import { ProxyConsentRequired } from '../../providers/shortener/shortener-transport';
import { assertValidDestination } from '../../providers/shortener/shortener-provider';
import { PageDiagnostics } from '../../page-diagnostics';

// i18n pages.links.title: 🔗 Links
// i18n pages.links.intro: Short links you have made. Create new ones with your connected shortener, and delete the ones you no longer want redirecting.
// i18n pages.links.setup: Set up a link shortener
// i18n pages.links.setupProviders: TinyURL and is.gd work straight away with no account at all. Dub, Short.io, T.LY and Rebrandly need a free or paid account, and can list and delete links afterwards.
// i18n pages.links.newWith: New short link with {{service}}
// i18n pages.links.destination: Destination URL
// i18n pages.links.destinationPlaceholder: https://example.com/the-long-url
// i18n pages.links.customBackHalf: Custom back-half
// i18n pages.links.optional: (optional)
// i18n pages.links.slugPlaceholder: my-link
// i18n pages.links.titleLabel: Title
// i18n pages.links.description: Description
// i18n pages.links.shortening: Shortening…
// i18n pages.links.shorten: Shorten
// i18n pages.links.yourLinks: Your links
// i18n pages.links.searchPlaceholder: Search links
// i18n pages.links.loading: Loading…
// i18n pages.links.search: Search
// i18n pages.links.empty: No links yet. Anything you shorten here — and any messages you have shared as a link from the Pastes page — will show up in this list.
// i18n pages.links.backHalf: Back-half
// i18n pages.links.save: Save
// i18n pages.links.cancel: Cancel
// i18n pages.links.messageDestination: A message you shared — the text is inside the link itself.
// i18n pages.links.message: message
// i18n pages.links.expires: expires {{time}}
// i18n pages.links.readOnly.message: Permanent — a shared message can't be edited
// i18n pages.links.readOnly.anonymous: Permanent — made without an account
// i18n pages.links.readOnly.switchProvider: Switch to {{provider}} to manage this
// i18n pages.links.readOnly.unsupported: This service can't edit or delete links
// i18n pages.links.deleteConfirm: Delete this link?
// i18n pages.links.delete: Delete
// i18n pages.links.keep: Keep
// i18n pages.links.edit: Edit
// i18n pages.links.notice.created: Created {{url}}
// i18n pages.links.notice.updated: Link updated.
// i18n pages.links.notice.deleted: Link deleted. It will stop redirecting immediately.
// i18n pages.links.error.load: Couldn't load your links.
// i18n pages.links.error.invalidDestination: That destination URL is not valid.
// i18n pages.links.error.create: Couldn't create that link.
// i18n pages.links.error.update: Couldn't update that link.
// i18n pages.links.error.delete: Couldn't delete that link.
// i18n pages.links.serviceFallback: This service
// i18n pages.links.error.proxySetup: {{service}} doesn't answer web browsers directly. Set up a CORS proxy under Settings → Connections, then try again.
// i18n pages.links.error.proxyDeclined: Not sent through {{proxy}}. The direct attempt also failed. Retry later, or choose a different CORS proxy in Settings.
// i18n pages.links.blocked.none: No link shortener is connected yet.
// i18n pages.links.blocked.key: Add your {{provider}} {{credential}} to start shortening links.
// i18n pages.links.blocked.domain: {{provider}} needs the short domain from your account before it can create links.

/**
 * The Links page: everything this browser has shortened, and a form to add more.
 *
 * ## What is on screen is a merge, not one API's answer
 *
 * The list combines the active provider's own links, this browser's local record
 * of what it created, and the TinyURL message-links made by the Pastes feature.
 * {@link ShortenerRegistry.list} does the merging; see
 * {@link mergeLinks} for why the provider wins on field values while local
 * history wins on ordering.
 *
 * A consequence worth stating plainly: rows can appear here that this browser
 * did not create, because they are in the connected account. That is intended —
 * the page is "your links", not "links made in this tab".
 *
 * ## Why the create form is generated from capabilities
 *
 * Each provider supports a different subset of title, description, tags, expiry
 * and password. Rendering all of them everywhere would mean silently discarding
 * whatever the active provider ignores, so the form asks
 * {@link ShortenerProvider.capabilities} and shows only the fields that will
 * actually be honoured.
 */
@Component({
  selector: 'app-links-page',
  imports: [FormsModule, RouterLink, HumanTimePipe, ProxyConsentDialog, TranslocoPipe],
  templateUrl: './links-page.html',
  styleUrl: './links-page.css',
})
export class LinksPage implements OnInit {
  protected registry = inject(ShortenerRegistry);
  protected settings = inject(ShortenerSettings);
  private consent = inject(ShortenerProxyConsent);
  private proxy = inject(CorsProxy);
  private diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);

  protected readonly links = signal<ShortLinkRecord[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly search = signal('');

  /** The create form. Only the fields the active provider honours are shown. */
  protected readonly destination = signal('');
  protected readonly slug = signal('');
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly creating = signal(false);

  /** The row being edited, keyed by `provider:providerId`, or null. */
  protected readonly editing = signal<string | null>(null);
  protected readonly editDestination = signal('');
  protected readonly editTitle = signal('');
  protected readonly editSlug = signal('');
  protected readonly busyRow = signal<string | null>(null);

  /** The row awaiting delete confirmation. */
  protected readonly confirmingDelete = signal<string | null>(null);

  protected readonly consentPrompt = signal<{
    shortener: ShortenerCatalogEntry;
    proxy: CorsProxyEntry;
    carriesCredential: boolean;
  } | null>(null);

  /**
   * What the last CORS-blocked action was, so consenting can resume it rather
   * than just dismissing the dialog. Without this the user grants permission and
   * then has to redo whatever they were doing, which reads as the click having
   * failed.
   */
  private pendingAction: (() => Promise<void>) | null = null;

  protected readonly provider = computed(() => this.registry.active());
  protected readonly capabilities = computed(() => this.provider()?.capabilities() ?? null);
  protected readonly entry = computed(() => shortenerEntry(this.settings.activeId()) ?? null);

  /** Why the page cannot shorten anything yet, or null when it can. */
  protected readonly blocked = computed(() => {
    const entry = this.settings.chosen();
    if (!entry) {
      return this.transloco.translate('pages.links.blocked.none');
    }
    if (entry.keyPolicy === 'required' && !this.settings.hasKey(entry.id)) {
      return this.transloco.translate('pages.links.blocked.key', {
        provider: entry.label,
        credential: entry.keyLabel,
      });
    }
    if (entry.domainRequired && !this.settings.domain(entry.id)) {
      return this.transloco.translate('pages.links.blocked.domain', { provider: entry.label });
    }
    return null;
  });

  ngOnInit(): void {
    void this.reload();
  }

  protected key(record: ShortLinkRecord): string {
    return `${record.provider}:${record.providerId}`;
  }

  /**
   * Whether this row is a message-in-a-URL rather than a shortened link.
   *
   * These come from the Pastes feature: the redirect target is a
   * `mawkingbird.com/message/message-status.…` URL holding a post body, so the link *is* the
   * message. The row shows the message rather than a destination, and offers no
   * editing — there is no destination to re-point.
   */
  protected isMessage(record: ShortLinkRecord): boolean {
    return linkKind(record) === 'message';
  }

  /**
   * Rows this app cannot modify: anonymous links, message links, and anything
   * belonging to a provider that is not the active one.
   *
   * The last case is not a limitation so much as a fact — the credentials for a
   * different service are not in play, so its Edit button could only ever fail.
   */
  protected readOnly(record: ShortLinkRecord): boolean {
    if (record.readOnly === true || this.isMessage(record)) {
      return true;
    }
    if (record.provider !== this.settings.activeId()) {
      return true;
    }
    const caps = this.capabilities();
    return !caps?.update && !caps?.delete;
  }

  /** Whether the active provider can delete, so the row shows the right buttons. */
  protected canDelete(record: ShortLinkRecord): boolean {
    return !this.readOnly(record) && this.capabilities()?.delete === true;
  }

  protected canEdit(record: ShortLinkRecord): boolean {
    return !this.readOnly(record) && this.capabilities()?.update === true;
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.links.set(await firstValueFrom(this.registry.list({ search: this.search() })));
    } catch (error: unknown) {
      this.diagnostics.error('Links', 'load:error', error);
      if (!this.offerConsent(error, () => this.reload())) {
        this.error.set(describeError(error, this.transloco.translate('pages.links.error.load')));
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected async create(): Promise<void> {
    const destination = this.destination().trim();
    if (!destination) {
      return;
    }
    try {
      assertValidDestination(destination);
    } catch (error: unknown) {
      this.diagnostics.warn('Links', 'user:invalid-destination', {
        reason: error instanceof Error ? error.message : 'invalid',
      });
      this.error.set(
        describeError(error, this.transloco.translate('pages.links.error.invalidDestination')),
      );
      return;
    }

    this.creating.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const caps = this.capabilities();
      const link = await firstValueFrom(
        this.registry.create({
          destinationUrl: destination,
          ...(caps?.customSlug && this.slug().trim() ? { slug: this.slug().trim() } : {}),
          ...(caps?.title && this.title().trim() ? { title: this.title().trim() } : {}),
          ...(caps?.description && this.description().trim()
            ? { description: this.description().trim() }
            : {}),
        }),
      );
      this.destination.set('');
      this.slug.set('');
      this.title.set('');
      this.description.set('');
      this.notice.set(
        this.transloco.translate('pages.links.notice.created', { url: link.shortUrl }),
      );
      await this.reload();
    } catch (error: unknown) {
      this.diagnostics.error('Links', 'create:error', error);
      if (!this.offerConsent(error, () => this.create())) {
        this.error.set(describeError(error, this.transloco.translate('pages.links.error.create')));
      }
    } finally {
      this.creating.set(false);
    }
  }

  protected startEdit(record: ShortLinkRecord): void {
    this.editing.set(this.key(record));
    this.editDestination.set(record.destinationUrl);
    this.editTitle.set(record.title ?? '');
    this.editSlug.set(record.slug ?? '');
    this.error.set(null);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  protected async saveEdit(record: ShortLinkRecord): Promise<void> {
    const caps = this.capabilities();
    const key = this.key(record);
    this.busyRow.set(key);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.registry.update(record.providerId, {
          destinationUrl: this.editDestination().trim(),
          ...(caps?.title ? { title: this.editTitle().trim() } : {}),
          ...(caps?.customSlug && this.editSlug().trim() !== (record.slug ?? '')
            ? { slug: this.editSlug().trim() }
            : {}),
        }),
      );
      this.editing.set(null);
      this.notice.set(this.transloco.translate('pages.links.notice.updated'));
      await this.reload();
    } catch (error: unknown) {
      this.diagnostics.error('Links', 'update:error', error);
      if (!this.offerConsent(error, () => this.saveEdit(record))) {
        this.error.set(describeError(error, this.transloco.translate('pages.links.error.update')));
      }
    } finally {
      this.busyRow.set(null);
    }
  }

  protected async remove(record: ShortLinkRecord): Promise<void> {
    const key = this.key(record);
    this.confirmingDelete.set(null);
    this.busyRow.set(key);
    this.error.set(null);
    try {
      await firstValueFrom(this.registry.delete(record.providerId));
      this.notice.set(this.transloco.translate('pages.links.notice.deleted'));
      await this.reload();
    } catch (error: unknown) {
      this.diagnostics.error('Links', 'delete:error', error);
      if (!this.offerConsent(error, () => this.remove(record))) {
        this.error.set(describeError(error, this.transloco.translate('pages.links.error.delete')));
      }
    } finally {
      this.busyRow.set(null);
    }
  }

  /**
   * If this failure was "needs the proxy", raise the consent dialog and remember
   * what to resume. Returns whether the error was handled that way.
   */
  private offerConsent(error: unknown, retry: () => Promise<void>): boolean {
    if (!(error instanceof ProxyConsentRequired)) {
      return false;
    }
    const entry = this.entry();
    const proxy = this.proxy.entry();
    if (error.noProxyConfigured || !entry || !proxy) {
      this.error.set(
        this.transloco.translate('pages.links.error.proxySetup', {
          service: entry?.label ?? this.transloco.translate('pages.links.serviceFallback'),
        }),
      );
      return true;
    }
    this.pendingAction = retry;
    this.consentPrompt.set({ shortener: entry, proxy, carriesCredential: error.carriesCredential });
    return true;
  }

  protected async acceptConsent(): Promise<void> {
    const prompt = this.consentPrompt();
    const resume = this.pendingAction;
    this.consentPrompt.set(null);
    this.pendingAction = null;
    if (!prompt) {
      return;
    }
    this.consent.grant(prompt.shortener.id, prompt.proxy.id);
    await resume?.();
  }

  protected declineConsent(): void {
    const prompt = this.consentPrompt();
    this.consentPrompt.set(null);
    this.pendingAction = null;
    if (prompt) {
      this.error.set(
        this.transloco.translate('pages.links.error.proxyDeclined', { proxy: prompt.proxy.label }),
      );
    }
  }
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
