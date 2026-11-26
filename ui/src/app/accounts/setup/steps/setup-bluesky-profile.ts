import { Component, inject, OnDestroy, signal, ChangeDetectionStrategy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MbControl, MbField } from '../../../design-system/field/field';
import { MbFileDrop, type MbPickedFile } from '../../../design-system/file-drop/file-drop';
import { BlueskyApi } from '../../../connections/bluesky/bluesky-api';
import { prepareImageForBluesky } from '../../../connections/bluesky/bluesky-image';
import { BlueskySession } from '../../../connections/bluesky/bluesky-session';
import { Auth } from '../../../platform/session/auth';
import { Pseudonymity } from '../../pseudonymity';
import { onSetupNext } from '../setup-state';

/** Bluesky's own limits: 64 graphemes for the name, 256 for the bio. */
const NAME_MAX = 64;
const BIO_MAX = 256;

/**
 * Name, picture and bio for a new Bluesky account, written to its
 * `app.bsky.actor.profile` record the way Settings → Public profile writes it:
 * read the record, change only these fields, put it back guarded by its CID.
 * A brand-new account may have no record yet; the API starts an empty one.
 */
@Component({
  selector: 'app-setup-bluesky-profile',
  imports: [MbField, MbControl, MbFileDrop],
  templateUrl: './setup-bluesky-profile.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setup-steps.css',
})
export class SetupBlueskyProfile implements OnDestroy {
  private readonly api = inject(BlueskyApi);
  private readonly auth = inject(Auth);
  private readonly session = inject(BlueskySession);
  private readonly pseudonymity = inject(Pseudonymity);
  protected readonly state = onSetupNext(() => this.save());

  protected readonly nameMax = NAME_MAX;
  protected readonly bioMax = BIO_MAX;
  protected readonly displayName = signal('');
  protected readonly description = signal('');
  protected readonly avatar = signal<File | null>(null);
  protected readonly avatarUrl = signal('');
  private original = { displayName: '', description: '' };
  private preview = '';

  constructor() {
    this.api.getProfile().subscribe({
      next: (profile) => {
        this.original = {
          displayName: profile.displayName ?? '',
          description: profile.description ?? '',
        };
        this.displayName.set(this.original.displayName);
        this.description.set(this.original.description);
        this.avatarUrl.set(profile.avatar ?? '');
      },
      // A profile the AppView hasn't indexed yet starts blank.
      error: () => undefined,
    });
  }

  ngOnDestroy(): void {
    if (this.preview) URL.revokeObjectURL(this.preview);
  }

  protected onAvatar(picked: MbPickedFile[]): void {
    const file = picked[0]?.file ?? null;
    if (!file) return;
    if (this.preview) URL.revokeObjectURL(this.preview);
    this.preview = URL.createObjectURL(file);
    this.avatar.set(file);
    this.avatarUrl.set(this.preview);
  }

  private async save(): Promise<void> {
    const nameChanged = this.displayName() !== this.original.displayName;
    const bioChanged = this.description() !== this.original.description;
    const file = this.avatar();
    if (!nameChanged && !bioChanged && !file) return;
    const current = await firstValueFrom(this.api.getOwnProfileRecord());
    let avatar = current.value.avatar;
    if (file) {
      const prepared = await prepareImageForBluesky(file, this.pseudonymity.cleanMedia());
      if (!prepared) throw new Error('The picture could not be prepared for Bluesky.');
      avatar = (await firstValueFrom(this.api.uploadBlob(prepared.blob, prepared.mimeType))).blob;
    }
    await firstValueFrom(
      this.api.putProfile(
        {
          ...current.value,
          displayName: this.displayName().trim(),
          description: this.description().trim(),
          ...(avatar ? { avatar } : {}),
        },
        current.cid || undefined,
      ),
    );
    this.session.updateProfileSnapshot({ displayName: this.displayName().trim() });
    this.auth.refreshBlueskyAccount();
    this.original = { displayName: this.displayName(), description: this.description() };
    this.avatar.set(null);
  }
}
