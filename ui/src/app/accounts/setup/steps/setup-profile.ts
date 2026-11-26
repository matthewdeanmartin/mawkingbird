import {
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../../../design-system/button/button';
import { MbControl, MbField } from '../../../design-system/field/field';
import { MbFileDrop, type MbPickedFile } from '../../../design-system/file-drop/file-drop';
import { Api } from '../../../platform/api/api';
import type { Account } from '../../../platform/api/models';
import { Auth } from '../../../platform/session/auth';
import { onSetupNext } from '../setup-state';

/** A profile's plain-text bio: `source.note` when the snapshot has it, else the HTML stripped. */
function plainNote(account: Account): string {
  if (account.source?.note !== undefined) return account.source.note;
  const doc = new DOMParser().parseFromString(account.note ?? '', 'text/html');
  return doc.body.textContent ?? '';
}

/**
 * Name, picture and bio: the parts of Settings → Public profile that decide
 * whether a stranger follows back. Saved with the same `update_credentials`
 * form keys Settings uses, and only the fields that changed. Header and
 * profile links stay in Settings, to keep this step short.
 */
@Component({
  selector: 'app-setup-profile',
  imports: [MbField, MbControl, MbButton, MbFileDrop],
  templateUrl: './setup-profile.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setup-steps.css',
})
export class SetupProfile implements OnDestroy {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly state = onSetupNext(() => this.save());

  protected readonly displayName = signal('');
  protected readonly note = signal('');
  protected readonly avatar = signal<File | null>(null);
  protected readonly avatarUrl = signal('');
  protected readonly loaded = signal(false);
  private original = { displayName: '', note: '' };
  private preview = '';

  /** Another signed-in account to copy name and bio from. Never offered to a pseudonym. */
  protected readonly copySource = computed(() => {
    if (this.state.record().purpose === 'pseudonym') return null;
    const token = this.auth.token();
    return this.auth.sessions().find((s) => s.token !== token && s.account)?.account ?? null;
  });

  constructor() {
    this.api.verifyCredentials().subscribe({
      next: (account) => {
        this.original = { displayName: account.display_name ?? '', note: plainNote(account) };
        this.displayName.set(this.original.displayName);
        this.note.set(this.original.note);
        this.avatarUrl.set(account.avatar ?? '');
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  ngOnDestroy(): void {
    if (this.preview) URL.revokeObjectURL(this.preview);
  }

  protected copyFrom(account: Account): void {
    this.displayName.set(account.display_name ?? '');
    this.note.set(plainNote(account));
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
    const form = new FormData();
    if (this.displayName() !== this.original.displayName) {
      form.append('display_name', this.displayName());
    }
    if (this.note() !== this.original.note) form.append('note', this.note());
    const avatar = this.avatar();
    if (avatar) form.append('avatar', avatar);
    if (![...form.keys()].length) return;
    const account = await firstValueFrom(this.api.updateCredentials(form));
    this.auth.setAccount(account);
    this.original = { displayName: this.displayName(), note: this.note() };
    this.avatar.set(null);
  }
}
