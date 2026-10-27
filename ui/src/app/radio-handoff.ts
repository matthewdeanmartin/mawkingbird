import { Injectable } from '@angular/core';
import { Status } from './models';
import { radioPostRef } from './radio-links';

/**
 * A post the reader asked to play, handed to the lazy Radio page so it does not
 * refetch from the post's origin (which may refuse anonymous browser requests).
 */
@Injectable({ providedIn: 'root' })
export class RadioHandoff {
  private post: Status | null = null;
  offer(post: Status): void {
    this.post = post;
  }
  /** The offered post when it matches the portable `url`; consumed either way. */
  take(url: string): Status | null {
    const post = this.post;
    this.post = null;
    return post && radioPostRef(post.url ?? null)?.originalUrl === url ? post : null;
  }
}
