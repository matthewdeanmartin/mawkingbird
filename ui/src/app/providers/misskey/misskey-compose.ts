import {
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../../auth';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbControl, MbField } from '../../design-system/field/field';
import { Status } from '../../models';
import { MisskeyApi, MisskeyApiError } from './misskey-api';
import { MisskeyAuth } from './misskey-auth';
import { misskeyIdentity } from './misskey-identity-store';
import type { MisskeyRef } from './misskey-adapter';
import { MkCreateNote, MkVisibility } from './misskey-types';

// i18n misskeyCompose.placeholder: What's happening?
// i18n misskeyCompose.textLabel: Note
// i18n misskeyCompose.cw: Content warning
// i18n misskeyCompose.cwLabel: Content warning text
// i18n misskeyCompose.cwPlaceholder: What the hidden text is about
// i18n misskeyCompose.visibilityLabel: Who can see it
// i18n misskeyCompose.visibility.public: Public
// i18n misskeyCompose.visibility.home: Home (not on public timelines)
// i18n misskeyCompose.visibility.followers: Followers only
// i18n misskeyCompose.localOnly: Only this server (do not federate)
// i18n misskeyCompose.attach: Add images
// i18n misskeyCompose.altLabel: Description (alt text)
// i18n misskeyCompose.sensitive: Sensitive
// i18n misskeyCompose.remove: Remove
// i18n misskeyCompose.post: Note
// i18n misskeyCompose.reply: Reply
// i18n misskeyCompose.quote: Quote
// i18n misskeyCompose.posting: Posting…
// i18n misskeyCompose.remaining: {{count}} left
// i18n misskeyCompose.tooMany: You can attach up to {{max}} files.
// i18n misskeyCompose.failed: Could not post. Please try again.
// i18n misskeyCompose.uploadFailed: Could not upload {{name}}.
// i18n misskeyCompose.needsApproval: Posting needs one more approval on Misskey.
// i18n misskeyCompose.approve: Approve on Misskey

/** Mastodon visibility word on an adapted note → the Misskey one. */
function misskeyVisibility(mastodon: string | undefined): Exclude<MkVisibility, 'specified'> {
  switch (mastodon) {
    case 'unlisted':
      return 'home';
    case 'private':
    case 'direct':
      return 'followers';
    default:
      return 'public';
  }
}

const VISIBILITY_ORDER: Exclude<MkVisibility, 'specified'>[] = ['public', 'home', 'followers'];

/** Most attachments offered here; Misskey's own default limit is 16. */
export const MAX_FILES = 4;

interface PendingFile {
  file: File;
  preview: string;
  alt: string;
  sensitive: boolean;
}

/**
 * Write a Misskey note: a new one, a reply, or a quote.
 *
 * Its own composer rather than a seventh target in `compose.ts`: that one's
 * visibility, polls, media and drafts are shaped by Mastodon and Bluesky, and
 * Misskey's words differ (home and followers visibility, local-only, Drive).
 * Files go from the browser straight to the reader's Drive, never through a
 * proxy. Drafts and polls are not offered yet.
 */
@Component({
  selector: 'app-misskey-compose',
  imports: [FormsModule, TranslocoPipe, MbButton, MbCheckbox, MbField, MbControl],
  templateUrl: './misskey-compose.html',
  styleUrl: './misskey-compose.css',
})
export class MisskeyCompose implements OnInit, OnDestroy {
  private api = inject(MisskeyApi);
  private misskeyAuth = inject(MisskeyAuth);
  private auth = inject(Auth);
  private transloco = inject(TranslocoService);

  readonly replyTo = input<Status | null>(null);
  readonly quote = input<Status | null>(null);
  readonly compact = input(false);
  readonly placeholder = input<string | null>(null);
  readonly posted = output<Status>();

  protected readonly maxFiles = MAX_FILES;
  protected readonly visibilities = VISIBILITY_ORDER;
  protected text = signal('');
  protected cwOn = signal(false);
  protected cw = signal('');
  protected visibility = signal<Exclude<MkVisibility, 'specified'>>('public');
  protected localOnly = signal(false);
  protected files = signal<PendingFile[]>([]);
  protected posting = signal(false);
  protected error = signal<string | null>(null);
  protected needsApproval = signal(false);
  protected maxLength = signal(3000);

  protected readonly server = computed(
    () => misskeyIdentity(this.auth.activeMisskeyKey())?.profile.server ?? null,
  );
  protected readonly length = computed(() => [...this.text()].length + [...this.cw()].length);
  protected readonly remaining = computed(() => this.maxLength() - this.length());
  protected readonly canPost = computed(
    () =>
      !this.posting() &&
      this.remaining() >= 0 &&
      (this.text().trim().length > 0 || this.files().length > 0 || !!this.quote()),
  );
  protected readonly actionKey = computed(() =>
    this.replyTo()
      ? 'misskeyCompose.reply'
      : this.quote()
        ? 'misskeyCompose.quote'
        : 'misskeyCompose.post',
  );

  constructor() {
    void this.loadLimits();
  }

  ngOnInit(): void {
    // A reply is never wider than what it answers; a narrower choice stays possible.
    const parent = this.replyTo();
    if (parent) {
      this.visibility.set(misskeyVisibility(parent.visibility));
      if (parent.spoiler_text) {
        this.cwOn.set(true);
        this.cw.set(parent.spoiler_text);
      }
    }
  }

  ngOnDestroy(): void {
    for (const pending of this.files()) URL.revokeObjectURL(pending.preview);
  }

  private async loadLimits(): Promise<void> {
    const server = this.server();
    if (server) this.maxLength.set(await this.api.maxNoteLength(server));
  }

  protected visibilityAllowed(choice: Exclude<MkVisibility, 'specified'>): boolean {
    const parent = this.replyTo();
    if (!parent) return true;
    return (
      VISIBILITY_ORDER.indexOf(choice) >=
      VISIBILITY_ORDER.indexOf(misskeyVisibility(parent.visibility))
    );
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = '';
    const room = MAX_FILES - this.files().length;
    if (chosen.length > room) {
      this.error.set(
        this.transloco.translate<string>('misskeyCompose.tooMany', { max: MAX_FILES }),
      );
    }
    this.files.update((list) => [
      ...list,
      ...chosen.slice(0, Math.max(0, room)).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        alt: '',
        sensitive: false,
      })),
    ]);
  }

  protected updateFile(index: number, change: Partial<PendingFile>): void {
    this.files.update((list) => list.map((f, i) => (i === index ? { ...f, ...change } : f)));
  }

  protected removeFile(index: number): void {
    const removed = this.files()[index];
    if (removed) URL.revokeObjectURL(removed.preview);
    this.files.update((list) => list.filter((_, i) => i !== index));
  }

  async submit(): Promise<void> {
    if (!this.canPost()) return;
    const server = this.server();
    if (!server) return;
    this.posting.set(true);
    this.error.set(null);
    this.needsApproval.set(false);
    try {
      const fileIds: string[] = [];
      for (const pending of this.files()) {
        try {
          const uploaded = await firstValueFrom(
            this.api.uploadFile(pending.file, {
              comment: pending.alt.trim() || undefined,
              isSensitive: pending.sensitive,
            }),
          );
          fileIds.push(uploaded.id);
        } catch (error) {
          if (error instanceof MisskeyApiError && error.needsWriteApproval) throw error;
          throw new Error(
            this.transloco.translate<string>('misskeyCompose.uploadFailed', {
              name: pending.file.name,
            }),
            { cause: error },
          );
        }
      }
      const body: MkCreateNote = {
        visibility: this.visibility(),
        ...(this.text().trim() ? { text: this.text() } : {}),
        ...(this.cwOn() && this.cw().trim() ? { cw: this.cw() } : {}),
        ...(this.localOnly() ? { localOnly: true } : {}),
        ...(fileIds.length ? { fileIds } : {}),
      };
      const reply = this.replyTo();
      if (reply) body.replyId = (reply.providerRef as MisskeyRef).noteId;
      const quote = this.quote();
      if (quote) body.renoteId = (quote.providerRef as MisskeyRef).noteId;
      const [created, { adaptMisskeyNote }] = await Promise.all([
        firstValueFrom(this.api.createNote(body)),
        import('./misskey-adapter'),
      ]);
      this.reset();
      this.posted.emit(adaptMisskeyNote(created, server));
    } catch (error) {
      if (error instanceof MisskeyApiError && error.needsWriteApproval) {
        this.needsApproval.set(true);
      } else {
        this.error.set(
          error instanceof Error && !(error instanceof MisskeyApiError)
            ? error.message
            : this.transloco.translate<string>('misskeyCompose.failed'),
        );
      }
    } finally {
      this.posting.set(false);
    }
  }

  /** Send the reader back to Misskey to grant the write permissions (one time). */
  protected approve(): void {
    const server = this.server();
    if (server) location.assign(this.misskeyAuth.begin(server, false));
  }

  private reset(): void {
    for (const pending of this.files()) URL.revokeObjectURL(pending.preview);
    this.text.set('');
    this.cw.set('');
    this.cwOn.set(false);
    this.files.set([]);
  }
}
