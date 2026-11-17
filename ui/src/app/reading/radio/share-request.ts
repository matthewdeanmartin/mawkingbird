import { Injectable } from '@angular/core';
import type { RadioTrack } from './radio-player';

/**
 * The recording a listener asked to share, handed to the lazy Share page. A
 * track can come from a catalogue or a pasted link that has no address of its
 * own, so it travels in memory rather than in the URL.
 */
@Injectable({ providedIn: 'root' })
export class ShareRequest {
  private track: RadioTrack | null = null;

  offer(track: RadioTrack): void {
    this.track = track;
  }

  /** The offered recording; it stays until another replaces it, so Back returns to it. */
  take(): RadioTrack | null {
    return this.track;
  }
}
