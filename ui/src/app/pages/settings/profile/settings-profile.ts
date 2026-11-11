import { DatePipe } from '@angular/common';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { MbSettingsRow } from '../../../design-system/settings-row/settings-row';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom, map, of, switchMap } from 'rxjs';
import { Api } from '../../../api';
import { Auth } from '../../../auth';
import { AccountField } from '../../../models';
import { AnonymousAccount } from '../../../providers/anonymous/anonymous-account';
import { PageDiagnostics } from '../../../page-diagnostics';
import { BlueskyApi } from '../../../providers/bluesky/bluesky-api';
import { prepareImageForBluesky } from '../../../providers/bluesky/bluesky-image';
import { Pseudonymity } from '../../../pseudonymity';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { BskyBlobRef, BskyProfile } from '../../../providers/bluesky/bluesky-types';
import { MbButton } from '../../../design-system/button/button';
import { MbControl, MbField } from '../../../design-system/field/field';
import { ProfileLinkDialog } from './profile-link-dialog';
import { ProfileBioDialog } from './profile-bio-dialog';
import { renderStatusText } from '../../../compose/status-text';
import { CustomEmojiPipe } from '../../../custom-emoji.pipe';
import { Account, CustomEmoji } from '../../../models';
import { ConfirmDialog } from '../../../confirm-dialog/confirm-dialog';
import { describeHttpError } from '../../../page-diagnostics';

type ProfileImage = 'avatar' | 'header';

/** Mastodon serves this placeholder when an account has no avatar or header. */
function realImage(url: string | null | undefined): string {
  return url && !/\/missing\.png(?:$|\?)/u.test(url) ? url : '';
}

/** Public profile: display name, bio, metadata fields, avatar/header. */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.profile.title: Public profile
// i18n settings.profile.bot: I'm a bot!
// i18n settings.profile.accountType: Account type
// i18n settings.profile.automation: Automation
// i18n settings.profile.bot.hint: Mark this as an automated account. A bot badge will appear on your profile.
// i18n settings.profile.intro: How you appear to other people on this server.
// i18n settings.profile.intro.anonymous: Your browser-local identity. Nothing here is published to {{server}}.
// i18n settings.profile.intro.bluesky: How you appear to people on Bluesky.
// i18n settings.profile.intro.misskey: Your profile lives on your Misskey server. Editing it from here comes in a later update; for now, change it on Misskey.
// i18n settings.profile.misskeyLink: Edit your profile on {{server}}
// i18n settings.profile.displayName: Display name
// i18n settings.profile.localHandle: Local handle
// i18n settings.profile.localHandle.hint: Shown only in this browser. It does not create an account.
// i18n settings.profile.bio: Bio
// i18n settings.profile.bio.hint: Describe yourself. Appears on your public profile.
// i18n settings.profile.metadata: Links and profile details
// i18n settings.profile.field.label: Label
// i18n settings.profile.field.content: Content
// i18n settings.profile.field.remove: Remove field
// i18n settings.profile.verified: ✓ verified
// i18n settings.profile.verified.title: Link ownership verified via rel=me on {{date}}
// i18n settings.profile.addField: + Add field
// i18n settings.profile.links.full: All 4 profile rows are in use. You can explore this form, but to add a link, cancel and remove a row from your profile first.
// i18n settings.profile.metadata.hint: Up to 4 table rows shown on your profile (links, pronouns, ...). A link whose page links back to your profile with rel="me" shows as ✓ verified (checked by the server when you save).
// i18n settings.profile.avatar: Avatar
// i18n settings.profile.header: Header
// i18n settings.profile.resetLocal: Reset local profile
// i18n settings.profile.avatarDescription: Describe your avatar
// i18n settings.profile.headerDescription: Describe your header
// i18n settings.profile.imageDescription.hint: Read by screen readers. Up to 150 characters.
// i18n settings.profile.avatarCurrent: Your current avatar
// i18n settings.profile.headerCurrent: Your current header
// i18n settings.profile.removeAvatar: Remove avatar
// i18n settings.profile.removeHeader: Remove header
// i18n settings.profile.removeAvatar.confirm: Remove your avatar? Your profile will show the server's default picture until you upload a new one.
// i18n settings.profile.removeHeader.confirm: Remove your header image? Your profile will show a plain header until you upload a new one.
// i18n settings.profile.removeFailed: Could not remove that image. {{detail}}
// i18n settings.profile.descriptionsFailed: Your profile was saved, but the image descriptions were not. {{detail}}
@Component({
  selector: 'app-settings-profile',
  imports: [
    MbCheckbox,
    MbSettingsRow,
    DatePipe,
    FormsModule,
    TranslocoPipe,
    MbButton,
    MbField,
    MbControl,
    ProfileLinkDialog,
    ProfileBioDialog,
    CustomEmojiPipe,
    ConfirmDialog,
  ],
  templateUrl: './settings-profile.html',
  styleUrl: './settings-profile.css',
})
export class SettingsProfile implements OnInit {
  private pseudonymity = inject(Pseudonymity);
  private api = inject(Api);
  protected auth = inject(Auth);
  protected anonymous = inject(AnonymousAccount);
  private diagnostics = inject(PageDiagnostics);
  private blueskyApi = inject(BlueskyApi);
  private blueskySession = inject(BlueskySession);
  private transloco = inject(TranslocoService);

  protected displayName = signal('');
  protected username = signal('');
  protected note = signal('');
  protected renderedNote = signal('');
  protected profileEmojis = signal<CustomEmoji[]>([]);
  protected bioDialog = signal(false);
  protected bot = signal(false);
  protected fields = signal<AccountField[]>([]);
  protected readonly linkDialog = signal<'link' | 'profile' | null>(null);
  protected readonly canAddLink = computed(
    () =>
      this.fields().length < 4 ||
      this.fields().some((field) => !field.name.trim() && !field.value.trim()),
  );
  protected avatar = signal<File | null>(null);
  protected header = signal<File | null>(null);
  protected readonly imageKinds: readonly ProfileImage[] = ['avatar', 'header'];
  /** The server's current images ('' when there is none). Mastodon only. */
  protected currentImages = signal<Record<ProfileImage, string>>({ avatar: '', header: '' });
  /** True when the server's Profile API supports image descriptions (Mastodon 4.6+). */
  protected descriptionsAvailable = signal(false);
  protected descriptions = signal<Record<ProfileImage, string>>({ avatar: '', header: '' });
  private savedDescriptions: Record<ProfileImage, string> = { avatar: '', header: '' };
  protected confirmRemove = signal<ProfileImage | null>(null);
  protected removing = signal(false);
  protected saving = signal(false);
  protected saved = signal(false);
  protected saveError = signal<string | null>(null);
  /**
   * Field label → rel=me verification date. Only the rendered `fields` (not the
   * editable `source.fields`) carry `verified_at`, so match them up by name.
   */
  protected verifiedAt = signal<Record<string, string>>({});

  /** Where a Misskey-primary reader edits their profile until this page can. */
  protected readonly misskeyProfileUrl = computed(() => {
    // The visitor has no profile on the server to edit.
    const url =
      this.auth.isMisskeyPrimary && !this.auth.isMisskeyVisitor ? this.auth.account()?.url : null;
    return url ? new URL('/settings/profile', url).href : null;
  });
  protected readonly misskeyHost = computed(() => {
    const href = this.misskeyProfileUrl();
    return href ? new URL(href).host : '';
  });

  ngOnInit(): void {
    if (this.auth.isAnonymous) {
      this.loadAccount(this.anonymous.account());
      return;
    }
    if (this.auth.isMisskeyPrimary) {
      // Nothing to load: the form is not shown, and `verifyCredentials` is a
      // Mastodon call this account has no token for.
      return;
    }
    if (this.auth.isBlueskyPrimary) {
      this.blueskyApi.getProfile().subscribe({
        next: (profile) => this.loadBlueskyProfile(profile),
        error: (error) => {
          this.diagnostics.error('ProfileSettings', 'load-bluesky:error', error);
          this.saveError.set('Could not load your Bluesky profile.');
        },
      });
      return;
    }
    this.api.verifyCredentials().subscribe((acc) => {
      this.loadAccount(acc);
      this.setCurrentImages(acc);
      this.loadImageDescriptions();
    });
  }

  /** Mastodon accounts edit server images; Anonymous and Bluesky have their own paths. */
  protected get editsServerImages(): boolean {
    return !this.auth.isAnonymous && !this.auth.isBlueskyPrimary;
  }

  private setCurrentImages(acc: Pick<Account, 'avatar' | 'header'>): void {
    this.currentImages.set({ avatar: realImage(acc.avatar), header: realImage(acc.header) });
  }

  /** Probe the Profile API; a 404 (pre-4.6) just leaves descriptions hidden. */
  // i18n settings.profile.tabs.heading: Profile tabs
  // i18n settings.profile.tabs.row: What visitors see
  // i18n settings.profile.tabs.media: Show a Media tab
  // i18n settings.profile.tabs.mediaReplies: Include media from my replies
  // i18n settings.profile.tabs.featured: Show a Featured tab
  // i18n settings.profile.tabs.failed: That tab setting was not saved. {{detail}}
  // i18n settings.profile.attribution.heading: Author credit
  // i18n settings.profile.attribution.label: Websites that may credit you as author
  // i18n settings.profile.attribution.hint: One domain per line. When an article from one of these sites names you as its author, link previews show your profile.
  // i18n settings.profile.attribution.save: Save websites
  // i18n settings.profile.attribution.failed: The websites were not saved. {{detail}}

  /** Profile tab switches (Mastodon 4.6); null hides the section on older servers. */
  protected profileTabs = signal<{
    show_media: boolean;
    show_media_replies: boolean;
    show_featured: boolean;
  } | null>(null);
  protected tabSaving = signal(false);
  protected tabError = signal('');
  /** One domain per line; null when the server does not report attribution domains. */
  protected attribution = signal<string | null>(null);
  protected attributionSaving = signal(false);
  protected attributionSaved = signal(false);
  protected attributionError = signal('');

  /** Instant-apply, like the rest of the switches; a failed write reverts. */
  protected setProfileTab(
    key: 'show_media' | 'show_media_replies' | 'show_featured',
    value: boolean,
  ): void {
    const previous = this.profileTabs();
    if (!previous) return;
    this.profileTabs.set({ ...previous, [key]: value });
    this.tabSaving.set(true);
    this.tabError.set('');
    this.api.updateProfileSettings({ [key]: value }).subscribe({
      next: () => this.tabSaving.set(false),
      error: (error: unknown) => {
        this.tabSaving.set(false);
        this.profileTabs.set(previous);
        this.tabError.set(
          this.transloco.translate('settings.profile.tabs.failed', {
            detail: describeHttpError(error),
          }),
        );
      },
    });
  }

  protected saveAttribution(): void {
    const domains = (this.attribution() ?? '')
      .split(/[\s,]+/)
      .map((d) =>
        d
          .trim()
          .replace(/^https?:\/\//i, '')
          .replace(/\/.*$/, ''),
      )
      .filter(Boolean);
    this.attributionSaving.set(true);
    this.attributionSaved.set(false);
    this.attributionError.set('');
    this.api.updateProfileSettings({ attribution_domains: domains }).subscribe({
      next: (profile) => {
        this.attributionSaving.set(false);
        this.attributionSaved.set(true);
        this.attribution.set((profile?.attribution_domains ?? domains).join('\n'));
      },
      error: (error: unknown) => {
        this.attributionSaving.set(false);
        this.attributionError.set(
          this.transloco.translate('settings.profile.attribution.failed', {
            detail: describeHttpError(error),
          }),
        );
      },
    });
  }

  private loadImageDescriptions(): void {
    this.api.ownProfile().subscribe({
      next: (profile) => {
        if (profile.show_media !== undefined) {
          this.profileTabs.set({
            show_media: !!profile.show_media,
            show_media_replies: !!profile.show_media_replies,
            show_featured: !!profile.show_featured,
          });
        }
        if (profile.attribution_domains) {
          this.attribution.set(profile.attribution_domains.join('\n'));
        }
        if (profile.avatar_description === undefined && profile.header_description === undefined) {
          return; // API version 8: profile endpoint, but no descriptions yet.
        }
        this.savedDescriptions = {
          avatar: profile.avatar_description ?? '',
          header: profile.header_description ?? '',
        };
        this.descriptions.set({ ...this.savedDescriptions });
        this.descriptionsAvailable.set(true);
      },
      error: () => this.descriptionsAvailable.set(false),
    });
  }

  protected setDescription(kind: ProfileImage, value: string): void {
    this.descriptions.update((current) => ({ ...current, [kind]: value }));
    this.saved.set(false);
  }

  /** Remove an image without uploading a replacement, after confirmation. */
  protected removeImage(kind: ProfileImage): void {
    this.confirmRemove.set(null);
    if (this.removing()) return;
    this.removing.set(true);
    this.saveError.set(null);
    this.api.deleteProfileImage(kind).subscribe({
      next: (acc) => {
        this.auth.setAccount(acc);
        this.setCurrentImages(acc);
        this.removing.set(false);
        if (this.descriptionsAvailable() && this.savedDescriptions[kind]) {
          // A description of an image that no longer exists would mislead.
          const key = kind === 'avatar' ? 'avatar_description' : 'header_description';
          this.api.updateProfileImageDescriptions({ [key]: '' }).subscribe({
            next: () => {
              this.savedDescriptions = { ...this.savedDescriptions, [kind]: '' };
              this.descriptions.update((current) => ({ ...current, [kind]: '' }));
            },
            error: () => undefined,
          });
        }
      },
      error: (error: unknown) => {
        this.removing.set(false);
        this.saveError.set(
          this.transloco.translate('settings.profile.removeFailed', {
            detail: describeHttpError(error),
          }),
        );
      },
    });
  }

  /** Changed descriptions, in the Profile API's field names; null when nothing changed. */
  private changedDescriptions(): {
    avatar_description?: string;
    header_description?: string;
  } | null {
    if (!this.descriptionsAvailable()) return null;
    const now = this.descriptions();
    const changes: { avatar_description?: string; header_description?: string } = {};
    if (now.avatar.trim() !== this.savedDescriptions.avatar.trim()) {
      changes.avatar_description = now.avatar.trim();
    }
    if (now.header.trim() !== this.savedDescriptions.header.trim()) {
      changes.header_description = now.header.trim();
    }
    return Object.keys(changes).length ? changes : null;
  }

  private loadBlueskyProfile(profile: BskyProfile): void {
    this.displayName.set(profile.displayName ?? profile.handle);
    this.username.set(profile.handle);
    this.note.set(profile.description ?? '');
    this.renderedNote.set(renderStatusText(this.note()));
    this.fields.set([]);
    this.verifiedAt.set({});
  }

  private loadAccount(acc: import('../../../models').Account): void {
    this.bot.set(acc.bot === true);
    this.displayName.set(acc.display_name);
    this.username.set(acc.username);
    const html = acc.note ?? '';
    const plain =
      new DOMParser()
        .parseFromString(
          html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div)>/gi, '\n\n'),
          'text/html',
        )
        .body.textContent?.trim() ?? '';
    this.note.set(acc.source?.note ?? plain);
    this.renderedNote.set(html || renderStatusText(this.note(), acc.emojis));
    this.profileEmojis.set(acc.emojis ?? []);
    const fields = (acc.source?.fields ?? acc.fields ?? []).map((f) => ({
      name: f.name,
      value: f.value,
    }));
    this.fields.set(fields);
    const verified: Record<string, string> = {};
    for (const f of acc.fields ?? []) {
      if (f.verified_at) {
        verified[f.name] = f.verified_at;
      }
    }
    this.verifiedAt.set(verified);
  }

  setField(index: number, key: 'name' | 'value', value: string): void {
    this.fields.update((list) => list.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
  }

  protected applyBio(note: string): void {
    this.note.set(note);
    this.renderedNote.set(renderStatusText(note, this.profileEmojis()));
    this.saved.set(false);
    this.bioDialog.set(false);
  }

  addField(): void {
    if (this.fields().length < 4) {
      this.fields.update((list) => [...list, { name: '', value: '' }]);
    }
  }

  protected addLink(field: AccountField): void {
    if (!this.canAddLink() || this.saving()) return;
    this.fields.update((fields) => {
      const blank = fields.findIndex((entry) => !entry.name.trim() && !entry.value.trim());
      return blank < 0
        ? [...fields, field]
        : fields.map((entry, index) => (index === blank ? field : entry));
    });
    this.saved.set(false);
    this.linkDialog.set(null);
  }

  removeField(index: number): void {
    this.fields.update((list) => list.filter((_, i) => i !== index));
  }

  onAvatar(event: Event): void {
    this.avatar.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  onHeader(event: Event): void {
    this.header.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  saveProfile(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saved.set(false);
    this.saveError.set(null);

    if (this.auth.isAnonymous) {
      void this.saveAnonymousProfile();
      return;
    }
    if (this.auth.isBlueskyPrimary) {
      void this.saveBlueskyProfile();
      return;
    }

    const form = new FormData();
    form.append('display_name', this.displayName());
    form.append('note', this.note());
    form.append('bot', String(this.bot()));

    // Profile metadata fields use indexed form keys.
    const fields = this.fields().filter((f) => f.name.trim() || f.value.trim());
    fields.forEach((f, i) => {
      form.append(`fields_attributes[${i}][name]`, f.name);
      form.append(`fields_attributes[${i}][value]`, f.value);
    });

    if (this.avatar()) {
      form.append('avatar', this.avatar()!);
    }
    if (this.header()) {
      form.append('header', this.header()!);
    }

    const descriptionChanges = this.changedDescriptions();
    let profileSaved = false;
    this.api
      .updateCredentials(form)
      .pipe(
        switchMap((acc) => {
          this.auth.setAccount(acc);
          this.setCurrentImages(acc);
          this.renderedNote.set(acc.note || renderStatusText(this.note(), acc.emojis));
          profileSaved = true;
          if (!descriptionChanges) return of(true);
          // Descriptions live on the Profile API, after the images they describe.
          return this.api.updateProfileImageDescriptions(descriptionChanges).pipe(
            map((profile) => {
              this.savedDescriptions = {
                avatar: profile.avatar_description ?? this.descriptions().avatar.trim(),
                header: profile.header_description ?? this.descriptions().header.trim(),
              };
              return true;
            }),
          );
        }),
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          if (profileSaved && descriptionChanges) {
            this.saveError.set(
              this.transloco.translate('settings.profile.descriptionsFailed', {
                detail: describeHttpError(error),
              }),
            );
          }
        },
      });
  }

  private async saveBlueskyProfile(): Promise<void> {
    try {
      const current = await firstValueFrom(this.blueskyApi.getOwnProfileRecord());
      const [avatar, banner] = await Promise.all([
        this.uploadBlueskyImage(this.avatar()),
        this.uploadBlueskyImage(this.header()),
      ]);
      const record = {
        ...current.value,
        displayName: this.displayName(),
        description: this.note(),
        ...(avatar ? { avatar } : {}),
        ...(banner ? { banner } : {}),
      };
      await firstValueFrom(this.blueskyApi.putProfile(record, current.cid));

      // The AppView image URL may lag the repository write, so keep the existing
      // avatar snapshot while updating the name immediately.
      this.blueskySession.updateProfileSnapshot({ displayName: this.displayName() });
      this.auth.refreshBlueskyAccount();
      this.avatar.set(null);
      this.header.set(null);
      this.saved.set(true);
    } catch (error) {
      this.diagnostics.error('ProfileSettings', 'save-bluesky:error', error);
      this.saveError.set('Could not save your Bluesky profile. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  private async uploadBlueskyImage(file: File | null): Promise<BskyBlobRef | null> {
    if (!file) return null;
    const prepared = await prepareImageForBluesky(file, this.pseudonymity.cleanMedia());
    if (!prepared) throw new Error('The selected image could not be prepared for Bluesky.');
    return (await firstValueFrom(this.blueskyApi.uploadBlob(prepared.blob, prepared.mimeType)))
      .blob;
  }

  private async saveAnonymousProfile(): Promise<void> {
    try {
      const acc = await this.anonymous.updateProfile(
        {
          displayName: this.displayName(),
          username: this.username(),
          note: this.note(),
          fields: this.fields(),
        },
        this.avatar(),
        this.header(),
      );
      this.auth.setAccount(acc);
      this.loadAccount(acc);
      this.avatar.set(null);
      this.header.set(null);
      this.saved.set(true);
    } catch (error) {
      this.diagnostics.error('ProfileSettings', 'save-local:error', error);
      this.saveError.set(
        error instanceof Error ? error.message : 'Could not save the local profile.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  resetAnonymousProfile(): void {
    this.anonymous.resetIdentity();
    const acc = this.anonymous.account();
    this.auth.setAccount(acc);
    this.loadAccount(acc);
    this.saved.set(true);
    this.saveError.set(null);
  }
}
