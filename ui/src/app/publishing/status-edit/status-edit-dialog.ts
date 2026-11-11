import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../platform/api/api';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbNotice } from '../../design-system/notice/notice';
import { LANG_NAMES, LangCode } from '../../language/language-detect';
import { MediaAttachment, Status } from '../../platform/api/models';
import { describeHttpError } from '../../platform/diagnostics/page-diagnostics';
import { KnownLanguages } from '../../language/trend-language-filter';
import { FocalPoint, focalPointOf, objectPosition } from '../focal-point/focal-point';
import { FocalPointDialog } from '../focal-point/focal-point-dialog';
import {
  buildEditBody,
  EditMedia,
  EditPoll,
  editPollFrom,
  MAX_POLL_OPTIONS,
  pollVotesReset,
} from './status-edit';

// i18n statusEdit.title: Edit post
// i18n statusEdit.cancel: Cancel
// i18n statusEdit.save: Save changes
// i18n statusEdit.saving: Saving…
// i18n statusEdit.loading: Loading the post…
// i18n statusEdit.loadFailed: Could not load this post for editing. {{detail}}
// i18n statusEdit.saveFailed: The edit was not saved. {{detail}}
// i18n statusEdit.cw: Content warning
// i18n statusEdit.cwHint: Leave empty for none.
// i18n statusEdit.text: Text
// i18n statusEdit.sensitive: Mark media as sensitive
// i18n statusEdit.language: Language
// i18n statusEdit.languageUnset: Not specified
// i18n statusEdit.media: Attachments
// i18n statusEdit.mediaDescription: Description (alt text)
// i18n statusEdit.mediaRemove: Remove
// i18n statusEdit.mediaAdd: Add image or video
// i18n statusEdit.mediaUploading: Uploading…
// i18n statusEdit.mediaProcessing: The server is still processing an attachment. Try again in a moment.
// i18n statusEdit.mediaFailed: That file could not be attached. {{detail}}
// i18n statusEdit.poll: Poll
// i18n statusEdit.pollOption: Choice {{n}}
// i18n statusEdit.pollRemoveOption: Remove choice {{n}}
// i18n statusEdit.pollAddOption: Add a choice
// i18n statusEdit.pollMultiple: Allow more than one choice
// i18n statusEdit.pollAdd: Add a poll
// i18n statusEdit.pollRemove: Remove poll
// i18n statusEdit.pollReset: Changing the choices clears the votes cast so far.
// i18n statusEdit.pollReopens: This poll has closed. Saving the edit reopens it for 5 minutes, Mastodon's shortest poll.
// i18n statusEdit.visibilityNote: Who can see the post can't be changed by editing.

/** How long to wait for the server to finish processing a new attachment. */
const PROCESSING_TRIES = 60;
const PROCESSING_DELAY_MS = 1000;
const MAX_MEDIA = 4;

/**
 * Full Mastodon post editing: text, content warning, sensitivity, language,
 * attachments (add, remove, describe) and the poll, as Mastodon's own composer
 * offers. Visibility and the reply target cannot change on an edit.
 */
@Component({
  selector: 'app-status-edit-dialog',
  imports: [
    FormsModule,
    TranslocoPipe,
    MbButton,
    MbCheckbox,
    MbControl,
    MbDialog,
    MbField,
    MbNotice,
    FocalPointDialog,
  ],
  templateUrl: './status-edit-dialog.html',
  styleUrl: './status-edit-dialog.css',
})
export class StatusEditDialog implements OnInit {
  private readonly api = inject(Api);
  private readonly transloco = inject(TranslocoService);
  private readonly knownLanguages = inject(KnownLanguages);

  /** The author's own Mastodon post (not a boost wrapper). */
  readonly status = input.required<Status>();
  readonly saved = output<Status>();
  readonly closed = output<void>();

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(0);
  protected readonly error = signal('');
  protected readonly text = signal('');
  protected readonly spoilerText = signal('');
  protected readonly sensitive = signal(false);
  protected readonly language = signal('');
  protected readonly media = signal<EditMedia[]>([]);
  protected readonly poll = signal<EditPoll | null>(null);
  protected readonly maxPollOptions = MAX_POLL_OPTIONS;

  protected readonly languageOptions = computed(() =>
    [...new Set([...this.knownLanguages.codes(), this.language()].filter(Boolean))]
      .map((code) => ({ code, name: LANG_NAMES[code as LangCode] ?? code.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  protected readonly votesReset = computed(() =>
    pollVotesReset(this.status().poll ?? null, this.poll()),
  );
  /** Keeping a closed poll means re-sending it open; say so before saving. */
  protected readonly reopensPoll = computed(() => !!this.status().poll?.expired && !!this.poll());
  /** Mastodon posts carry attachments or a poll, never both. */
  protected readonly canAddMedia = computed(
    () => !this.poll() && this.media().length < MAX_MEDIA && !this.saving(),
  );
  protected readonly canSave = computed(() => {
    if (this.loading() || this.saving() || this.uploading() > 0) return false;
    const poll = this.poll();
    if (poll && poll.options.some((option) => !option.trim())) return false;
    return !!this.text().trim() || this.media().length > 0 || !!poll;
  });

  ngOnInit(): void {
    const status = this.status();
    this.sensitive.set(status.sensitive);
    this.language.set(status.language ?? '');
    this.media.set(status.media_attachments.map(toEditMedia));
    this.poll.set(status.poll ? editPollFrom(status.poll) : null);
    this.api.getStatusSource(status.id).subscribe({
      next: (source) => {
        this.text.set(source.text);
        this.spoilerText.set(source.spoiler_text);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          this.transloco.translate('statusEdit.loadFailed', { detail: describeHttpError(error) }),
        );
      },
    });
  }

  protected setDescription(index: number, description: string): void {
    this.media.update((list) => list.map((m, i) => (i === index ? { ...m, description } : m)));
  }

  // i18n statusEdit.focusPoint: Focus point
  /** Index of the image whose focus point is being chosen. */
  protected readonly focusing = signal<number | null>(null);

  protected setFocus(index: number, focus: FocalPoint): void {
    this.media.update((list) => list.map((m, i) => (i === index ? { ...m, focus } : m)));
    this.focusing.set(null);
  }

  protected thumbPosition(m: EditMedia): string | null {
    return objectPosition(m.focus ?? null);
  }

  protected removeMedia(index: number): void {
    this.media.update((list) => list.filter((_, i) => i !== index));
  }

  protected async addFiles(input: HTMLInputElement): Promise<void> {
    const files = [...(input.files ?? [])].slice(0, MAX_MEDIA - this.media().length);
    input.value = '';
    for (const file of files) {
      this.uploading.update((n) => n + 1);
      try {
        const uploaded = await this.processed(await firstValueFrom(this.api.uploadMedia(file)));
        this.media.update((list) => [...list, toEditMedia(uploaded)]);
      } catch (error: unknown) {
        this.error.set(
          error instanceof ProcessingTimeout
            ? this.transloco.translate('statusEdit.mediaProcessing')
            : this.transloco.translate('statusEdit.mediaFailed', {
                detail: describeHttpError(error),
              }),
        );
      } finally {
        this.uploading.update((n) => n - 1);
      }
    }
  }

  /** Mastodon refuses to attach media it is still processing (`url` is null). */
  private async processed(media: MediaAttachment): Promise<MediaAttachment> {
    let current = media;
    for (let tries = 0; !current.url; tries++) {
      if (tries >= PROCESSING_TRIES) throw new ProcessingTimeout();
      await new Promise((resolve) => setTimeout(resolve, PROCESSING_DELAY_MS));
      current = await firstValueFrom(this.api.getMedia(media.id));
    }
    return current;
  }

  protected addPoll(): void {
    this.poll.set({ options: ['', ''], multiple: false, expiresIn: 24 * 3600 });
  }

  protected removePoll(): void {
    this.poll.set(null);
  }

  protected setOption(index: number, title: string): void {
    this.updatePoll((p) => ({ ...p, options: p.options.map((o, i) => (i === index ? title : o)) }));
  }

  protected addOption(): void {
    this.updatePoll((p) =>
      p.options.length < MAX_POLL_OPTIONS ? { ...p, options: [...p.options, ''] } : p,
    );
  }

  protected removeOption(index: number): void {
    this.updatePoll((p) =>
      p.options.length > 2 ? { ...p, options: p.options.filter((_, i) => i !== index) } : p,
    );
  }

  protected setMultiple(multiple: boolean): void {
    this.updatePoll((p) => ({ ...p, multiple }));
  }

  private updatePoll(change: (poll: EditPoll) => EditPoll): void {
    const poll = this.poll();
    if (poll) this.poll.set(change(poll));
  }

  /** Cancel, Escape or the close button; never mid-save, so one edit is in flight. */
  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected save(): void {
    if (!this.canSave()) return;
    const body = buildEditBody({
      text: this.text(),
      spoilerText: this.spoilerText(),
      // Re-sent as stored: Mastodon also marks a post with a warning sensitive.
      sensitive: this.sensitive(),
      language: this.language(),
      media: this.media(),
      poll: this.poll(),
    });
    this.saving.set(true);
    this.error.set('');
    this.api.updateStatus(this.status().id, body).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.saved.emit(updated);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(
          this.transloco.translate('statusEdit.saveFailed', { detail: describeHttpError(error) }),
        );
      },
    });
  }
}

class ProcessingTimeout extends Error {}

function toEditMedia(media: MediaAttachment): EditMedia {
  const description = media.description ?? '';
  const focus = focalPointOf(media);
  return {
    id: media.id,
    type: media.type,
    previewUrl: media.preview_url || media.url,
    fullUrl: media.url || media.preview_url,
    description,
    savedDescription: description,
    focus,
    savedFocus: focus,
  };
}
