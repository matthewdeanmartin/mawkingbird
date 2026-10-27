import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { Auth } from '../../auth';
import { Compose } from '../../compose/compose';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbNavigation, MbNavLink } from '../../design-system/navigation/navigation';
import { Status } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { RadioStudio } from './radio-studio';
import { RadioStudioSession } from './radio-studio-session';

// i18n studio.title: Studio
// i18n studio.tab.compose: New audio post
// i18n studio.tab.catalogue: My audio
// i18n studio.recording: Recording
// i18n studio.placeholder: Say something about this recording…
// i18n radio.prepareAudio: Prepare an audio post
// i18n radio.stageHint: Choose an audio file to preview and prepare here. The file stays in this tab until you attach it; reloading or closing the tab discards it.
// i18n radio.audioFile: Audio file
// i18n radio.fileType: Format
// i18n radio.fileSize: Size
// i18n radio.fileDuration: Duration
// i18n radio.attach: Attach to post
// i18n radio.attaching: Uploading and processing…
// i18n radio.attached: Attached and processed. Write about it below and publish from the composer.
// i18n radio.attachFailed: The recording could not be uploaded or processed. Your file is still here; try again.
// i18n radio.cannotAttach: The composer cannot take audio right now. Close its poll or choose a Mastodon destination, then attach again.
// i18n radio.discardAudio: Discard recording
// i18n radio.audioOnly: Choose a nonempty audio file.
// i18n radio.limitsUnavailable: Could not verify this server’s audio limits. Nothing was uploaded. Try again later.
// i18n radio.unsupportedAudio: This file exceeds the server’s upload limit or uses an unsupported audio format. Choose another file.
// i18n radio.publishedAudio: Your audio post was published.
// i18n radio.studioFailed: Could not load your account or post. Try again.
// i18n radio.retryStudio: Retry loading account

/**
 * Write-plus-audio: the shared composer publishes the post, while this page
 * stages, inspects and uploads the recording it attaches.
 */
@Component({
  selector: 'app-studio-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbContentState,
    MbField,
    MbControl,
    MbNavigation,
    MbNavLink,
    Compose,
    StatusCard,
    RadioStudio,
  ],
  templateUrl: './studio-page.html',
  styleUrl: './studio-page.css',
})
export class StudioPage {
  readonly session = inject(RadioStudioSession);
  readonly auth = inject(Auth);
  readonly view = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((params) => (params.get('view') === 'catalogue' ? 'catalogue' : 'compose')),
    ),
    { initialValue: 'compose' as const },
  );
  readonly composer = viewChild(Compose);
  readonly duration = signal(0);
  readonly refused = signal(false);
  readonly details = computed(() => {
    const file = this.session.file();
    return file
      ? {
          type: file.type.replace(/^audio\//, '').toUpperCase(),
          size: `${(file.size / 1048576).toFixed(1)} MB`,
        }
      : null;
  });
  private handedOver = false;

  get signedIn(): boolean {
    return !this.auth.isAnonymous && !this.auth.isBlueskyPrimary;
  }

  constructor() {
    // Keep the session and composer agreeing about the one attached recording:
    // reattach it when this page is recreated, and release it when the composer drops it.
    effect(() => {
      const composer = this.composer();
      const attached = this.session.attached();
      const ids = composer?.attachmentIds() ?? [];
      if (!composer || !attached) {
        this.handedOver = false;
        return;
      }
      if (ids.includes(attached.id)) {
        this.handedOver = true;
        return;
      }
      untracked(() => {
        if (this.handedOver) this.session.detach();
        else this.handOver(composer);
      });
    });
  }

  pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.duration.set(0);
      this.refused.set(false);
      this.session.stage(file);
    }
    input.value = '';
  }

  metadata(event: Event): void {
    const duration = (event.target as HTMLAudioElement).duration;
    this.duration.set(Number.isFinite(duration) ? duration : 0);
  }

  clock(seconds: number): string {
    const value = Math.max(0, Math.round(seconds));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const rest = String(value % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }

  async attach(): Promise<void> {
    this.refused.set(false);
    const media = await this.session.attach();
    const composer = this.composer();
    if (media && composer) this.handOver(composer);
  }

  discard(): void {
    const attached = this.session.attached();
    const composer = this.composer();
    if (attached && composer) {
      const index = composer.attachmentIds().indexOf(attached.id);
      if (index >= 0) composer.removeMedia(index);
    }
    this.handedOver = false;
    this.refused.set(false);
    this.duration.set(0);
    this.session.discard();
  }

  posted(post: Status): void {
    this.handedOver = false;
    this.duration.set(0);
    this.session.posted(post);
  }

  private handOver(composer: Compose): void {
    const attached = this.session.attached();
    if (!attached) return;
    const accepted = composer.attachUploaded(attached, this.session.file() ?? undefined);
    this.handedOver = accepted || composer.attachmentIds().includes(attached.id);
    this.refused.set(!this.handedOver);
  }
}
