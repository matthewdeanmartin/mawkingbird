import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbContentState } from '../../design-system/content-state/content-state';
import { StatusCard } from '../../status-card/status-card';
import { RadioStudioSession } from './radio-studio-session';

// i18n radio.catalogue: My audio catalogue
// i18n radio.catalogueHint: Save references to your audio posts in this browser. Continue scans without starting over, or check for newer posts.
// i18n radio.findMine: Find all my audio
// i18n radio.refreshMine: Check for newer audio
// i18n radio.catalogueEmpty: No audio posts saved yet.
// i18n radio.catalogueComplete: All available history has been scanned.
// i18n radio.cataloguePaused: More history may be available. Continue scanning to find it.
// i18n radio.catalogueOpen: Preview post
// i18n radio.unavailable: This post is no longer available.
// i18n radio.storageFailed: This browser could not save your catalogue. Results remain available for this session only.
// i18n radio.studioFailed: Could not load your account or post. Try again.
// i18n radio.retryStudio: Retry loading account
// i18n radio.prepareAudio: Prepare an audio post
// i18n radio.stageHint: Choose an audio file to preview and prepare here. The file stays in this tab until you publish; reloading or closing the tab discards it.
// i18n radio.audioFile: Audio file
// i18n radio.postText: Post text
// i18n radio.audioDescription: Audio description or transcript
// i18n radio.postWarning: Content warning
// i18n radio.postVisibility: Visibility
// i18n radio.public: Public
// i18n radio.unlisted: Unlisted
// i18n radio.followers: Followers only
// i18n radio.publishAudio: Publish audio post
// i18n radio.publishingAudio: Uploading, processing and publishing…
// i18n radio.discardAudio: Discard staged draft
// i18n radio.audioOnly: Choose a nonempty audio file.
// i18n radio.limitsUnavailable: Could not verify this server’s audio limits. Nothing was uploaded. Try again later.
// i18n radio.unsupportedAudio: This file exceeds the server’s upload limit or uses an unsupported audio format. Choose another file.
// i18n radio.textTooLong: The post text and content warning exceed this server’s character limit.
// i18n radio.publishFailed: Publication could not be confirmed. Your draft is retained. Retry to finish the same publication; check your profile before discarding it.
// i18n radio.draftLocked: Publication has started. Retry uses the same draft to avoid duplicate posts. Discard to prepare a different post.
// i18n radio.publishedAudio: Your audio post was published.

@Component({
  selector: 'app-radio-studio',
  imports: [FormsModule, TranslocoPipe, MbButton, MbField, MbControl, MbContentState, StatusCard],
  templateUrl: './radio-studio.html',
  styleUrl: './radio-studio.css',
})
export class RadioStudio {
  readonly session = inject(RadioStudioSession);
  pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.session.stage(file);
    input.value = '';
  }
  retryTime(): string {
    return new Date(this.session.catalogue().retryAt()).toLocaleTimeString();
  }
}
