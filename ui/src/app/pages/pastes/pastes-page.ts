import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ClientPrefs } from '../../client-prefs';
import { Compose } from '../../compose/compose';
import { Drafts } from '../../drafts';
import { HumanTimePipe } from '../../human-time.pipe';
import { toSnapshot } from '../drafts/draft-items';
import { PasteHistory, PasteRecord } from '../../providers/paste/paste-history';
import { PasteProviderRegistry } from '../../providers/paste/paste-provider-registry';
import { Terminology } from '../../terminology';

// i18n pages.pastes.retired: This provider is no longer supported. Your saved text is still available; remote editing and deletion are disabled.
// i18n pages.pastes.title: Pastes
// i18n pages.pastes.note.a: Paste links and edit keys are saved only in this browser. Clearing site data removes your ability to edit or delete them.
// i18n pages.pastes.note.b: Short-link services (TinyURL) are permanent and public: those links cannot be edited or deleted afterwards. Your use of each service is governed by its own terms — see
// i18n pages.pastes.note.creditsPrivacy: Credits & Privacy
// i18n pages.pastes.tabs.mine: My Pastes
// i18n pages.pastes.tabs.feeds: Public Paste Feeds
// i18n pages.pastes.feeds.heading: Public paste feeds
// i18n pages.pastes.feeds.intro: These feeds are optional. Following one adds its recent public pastes to Home. Feeds are per account — following one here doesn't follow it for your other accounts.
// i18n pages.pastes.feeds.proxyConfigured: Paste feeds can be fetched through {{label}}. Turn it on per feed below — the proxy will see that feed's address and its contents.
// i18n pages.pastes.feeds.proxyMissing: No CORS proxy is set up. These services block browser access, so their feeds can't be read without one.
// i18n pages.pastes.feeds.changeProxy: Change
// i18n pages.pastes.feeds.setupProxy: Set one up
// i18n pages.pastes.feeds.viaProxy: via proxy
// i18n pages.pastes.feeds.proxyTitle: Fetched through your CORS proxy
// i18n pages.pastes.feeds.fetchThrough: Fetch through {{label}}
// i18n pages.pastes.feeds.follow: Follow {{noun}}
// i18n pages.pastes.feeds.unfollow: Unfollow {{noun}}
// i18n pages.pastes.feeds.publicFeed: public feed
// i18n pages.pastes.feeds.publicPastes: public pastes
// i18n pages.pastes.empty: Pastes created in this browser will appear here.
// i18n pages.pastes.edit.title: Title
// i18n pages.pastes.edit.language: Language
// i18n pages.pastes.edit.content: Paste
// i18n pages.pastes.edit.saving: Saving…
// i18n pages.pastes.edit.save: Save changes
// i18n pages.pastes.edit.cancel: Cancel
// i18n pages.pastes.untitled: Untitled paste
// i18n pages.pastes.actions.open: Open paste ↗
// i18n pages.pastes.actions.raw: Raw ↗
// i18n pages.pastes.actions.closeShare: Close share
// i18n pages.pastes.actions.share: Share ↗
// i18n pages.pastes.actions.shareTitle: {{post}} a link to this paste on Mastodon or Bluesky
// i18n pages.pastes.actions.editForPost: Edit for {{post}}
// i18n pages.pastes.actions.editForPostTitle: Open in the composer with a live {{post}} button — this paste stays put
// i18n pages.pastes.actions.toDraft: 💾 To draft
// i18n pages.pastes.actions.toDraftTitle: Copy into your local drafts — this paste stays put
// i18n pages.pastes.actions.edit: Edit
// i18n pages.pastes.actions.deleteRemote: Delete remotely
// i18n pages.pastes.actions.forget: Forget link
// i18n pages.pastes.share.description: Share the link. The paste lives at {{provider}} — the post below just points to it. Pick Mastodon or Bluesky in the composer.
// i18n pages.pastes.share.placeholder: Say something about your paste…
// i18n pages.pastes.notice.copiedToDraft: Copied to your local drafts. This paste is still here too.
// i18n pages.pastes.error.update: The paste could not be updated. It may have expired.
// i18n pages.pastes.error.delete: The provider could not delete that paste. It may already have expired.
// i18n pages.pastes.confirm.delete: Delete this paste from the provider? This cannot be undone.

/** Which top-level section is showing. "My Pastes" is the default landing tab. */

@Component({
  selector: 'app-pastes-page',
  imports: [FormsModule, RouterLink, HumanTimePipe, Compose, TranslocoPipe],
  templateUrl: './pastes-page.html',
  styleUrl: './pastes-page.css',
})
export class PastesPage {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  protected history = inject(PasteHistory);
  protected providers = inject(PasteProviderRegistry);
  private drafts = inject(Drafts).forCurrentAccount();
  private prefs = inject(ClientPrefs);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  /** Transient "that worked, and your paste survived" confirmation. */
  protected notice = signal<string | null>(null);

  protected editing = signal<string | null>(null);
  protected editTitle = signal('');
  protected editContent = signal('');
  protected editLanguage = signal('plaintext');
  protected busy = signal<string | null>(null);
  protected error = signal<string | null>(null);

  /**
   * The paste whose "Paste and Share" composer is open, or null. The paste
   * already exists at its provider; sharing just posts a link to it on the
   * socials (Mastodon/Bsky), so the composer is seeded with the title + URL and
   * lets the target picker choose where the link goes. One open at a time.
   */
  protected sharing = signal<string | null>(null);

  /** Open the share composer for a paste (closing any other), or toggle it shut. */
  toggleShare(record: PasteRecord): void {
    this.sharing.set(this.sharing() === record.slug ? null : record.slug);
  }

  /** Seed text for the share post: the title (if any) followed by the paste URL. */
  shareText(record: PasteRecord): string {
    const title = record.title?.trim();
    return title ? `${title}\n\n${record.url}` : record.url;
  }

  /** Once the share post is published, collapse the composer. */
  onShared(): void {
    this.sharing.set(null);
  }

  /** TinyURL links can't be edited or deleted after creation. */
  isImmutable(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    return !provider || !!provider.immutable;
  }

  beginEdit(record: PasteRecord): void {
    this.editing.set(record.slug);
    this.editTitle.set(record.title);
    this.editContent.set(record.content);
    this.editLanguage.set(record.language);
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.error.set(null);
  }

  save(record: PasteRecord): void {
    const provider = this.providers.get(record.providerId);
    if (!provider || !this.editContent().trim()) {
      return;
    }
    this.busy.set(record.slug);
    this.error.set(null);
    provider
      .update(record.slug, this.history.editKeyFor(record.slug), {
        title: this.editTitle().trim(),
        content: this.editContent(),
        language: this.editLanguage(),
      })
      .subscribe({
        next: () => {
          this.history.update(record.slug, {
            title: this.editTitle().trim(),
            content: this.editContent(),
            language: this.editLanguage(),
          });
          this.busy.set(null);
          this.editing.set(null);
        },
        error: () => {
          this.busy.set(null);
          this.error.set(this.transloco.translate('pages.pastes.error.update'));
        },
      });
  }

  delete(record: PasteRecord): void {
    if (!confirm(this.transloco.translate('pages.pastes.confirm.delete'))) {
      return;
    }
    const provider = this.providers.get(record.providerId);
    if (!provider) {
      this.history.remove(record.slug);
      return;
    }
    this.busy.set(record.slug);
    this.error.set(null);
    provider.delete(record.slug, this.history.editKeyFor(record.slug)).subscribe({
      next: () => {
        this.history.remove(record.slug);
        this.busy.set(null);
      },
      error: () => {
        this.busy.set(null);
        this.error.set(this.transloco.translate('pages.pastes.error.delete'));
      },
    });
  }

  /**
   * Copy a paste into a browser-local draft. The paste is deliberately left at
   * its provider — converting must never be how you lose the thing you
   * converted. Same rule, and same `toSnapshot`, as the /drafts page.
   */
  convertToDraft(record: PasteRecord): void {
    this.notice.set(null);
    this.error.set(null);
    if (
      !this.drafts.save(toSnapshot({ kind: 'paste', record }, this.prefs.defaultVisibility()))
        .durable
    ) {
      this.error.set(this.transloco.translate('drafts.saveFailed'));
      return;
    }
    this.notice.set(this.transloco.translate('pages.pastes.notice.copiedToDraft'));
  }

  /** Load the paste into the composer with a live Post button, leaving it in place. */
  editForPost(record: PasteRecord): void {
    this.drafts.handoff(toSnapshot({ kind: 'paste', record }, this.prefs.defaultVisibility()));
    void this.router.navigate(['/home']);
  }

  forget(record: PasteRecord): void {
    this.history.remove(record.slug);
    if (this.editing() === record.slug) {
      this.cancelEdit();
    }
  }
}
