import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
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

/** The Studio's catalogue of the account's own audio posts. */
@Component({
  selector: 'app-radio-studio',
  imports: [TranslocoPipe, MbButton, MbContentState, StatusCard],
  templateUrl: './radio-studio.html',
  styleUrl: './radio-studio.css',
})
export class RadioStudio {
  readonly session = inject(RadioStudioSession);
  retryTime(): string {
    return new Date(this.session.catalogue().retryAt()).toLocaleTimeString();
  }
}
