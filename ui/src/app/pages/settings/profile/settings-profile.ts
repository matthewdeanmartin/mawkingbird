import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../api';
import { Auth } from '../../../auth';
import { AccountField } from '../../../models';
import { AnonymousAccount } from '../../../providers/anonymous/anonymous-account';
import { PageDiagnostics } from '../../../page-diagnostics';
import { BlueskyApi } from '../../../providers/bluesky/bluesky-api';
import { prepareImageForBluesky } from '../../../providers/bluesky/bluesky-image';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { BskyBlobRef, BskyProfile } from '../../../providers/bluesky/bluesky-types';

/** Public profile: display name, bio, metadata fields, avatar/header. */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.profile.title: Public profile
// i18n settings.profile.intro: How you appear to other people on this server.
// i18n settings.profile.intro.anonymous: Your browser-local identity. Nothing here is published to {{server}}.
// i18n settings.profile.intro.bluesky: How you appear to people on Bluesky.
// i18n settings.profile.displayName: Display name
// i18n settings.profile.localHandle: Local handle
// i18n settings.profile.localHandle.hint: Shown only in this browser. It does not create an account.
// i18n settings.profile.bio: Bio
// i18n settings.profile.bio.hint: Describe yourself. Appears on your public profile.
// i18n settings.profile.metadata: Profile metadata
// i18n settings.profile.field.label: Label
// i18n settings.profile.field.content: Content
// i18n settings.profile.field.remove: Remove field
// i18n settings.profile.verified: ✓ verified
// i18n settings.profile.verified.title: Link ownership verified via rel=me on {{date}}
// i18n settings.profile.addField: + Add field
// i18n settings.profile.metadata.hint: Up to 4 table rows shown on your profile (links, pronouns, ...). A link whose page links back to your profile with rel="me" shows as ✓ verified (checked by the server when you save).
// i18n settings.profile.avatar: Avatar
// i18n settings.profile.header: Header
// i18n settings.profile.resetLocal: Reset local profile
@Component({
  selector: 'app-settings-profile',
  imports: [DatePipe, FormsModule, TranslocoPipe],
  templateUrl: './settings-profile.html',
  styleUrl: './settings-profile.css',
})
export class SettingsProfile implements OnInit {
  private api = inject(Api);
  protected auth = inject(Auth);
  protected anonymous = inject(AnonymousAccount);
  private diagnostics = inject(PageDiagnostics);
  private blueskyApi = inject(BlueskyApi);
  private blueskySession = inject(BlueskySession);

  protected displayName = signal('');
  protected username = signal('');
  protected note = signal('');
  protected fields = signal<AccountField[]>([]);
  protected avatar = signal<File | null>(null);
  protected header = signal<File | null>(null);
  protected saving = signal(false);
  protected saved = signal(false);
  protected saveError = signal<string | null>(null);
  /**
   * Field label → rel=me verification date. Only the rendered `fields` (not the
   * editable `source.fields`) carry `verified_at`, so match them up by name.
   */
  protected verifiedAt = signal<Record<string, string>>({});

  ngOnInit(): void {
    if (this.auth.isAnonymous) {
      this.loadAccount(this.anonymous.account());
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
    this.api.verifyCredentials().subscribe((acc) => this.loadAccount(acc));
  }

  private loadBlueskyProfile(profile: BskyProfile): void {
    this.displayName.set(profile.displayName ?? profile.handle);
    this.username.set(profile.handle);
    this.note.set(profile.description ?? '');
    this.fields.set([]);
    this.verifiedAt.set({});
  }

  private loadAccount(acc: import('../../../models').Account): void {
    this.displayName.set(acc.display_name);
    this.username.set(acc.username);
    this.note.set(acc.source?.note ?? acc.note ?? '');
    const fields = (acc.source?.fields ?? acc.fields ?? []).map((f) => ({
      name: f.name,
      value: f.value,
    }));
    this.fields.set(fields.length ? fields : [{ name: '', value: '' }]);
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

  addField(): void {
    if (this.fields().length < 4) {
      this.fields.update((list) => [...list, { name: '', value: '' }]);
    }
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

    this.api.updateCredentials(form).subscribe({
      next: (acc) => {
        this.auth.setAccount(acc);
        this.saving.set(false);
        this.saved.set(true);
      },
      error: () => this.saving.set(false),
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
    const prepared = await prepareImageForBluesky(file);
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
