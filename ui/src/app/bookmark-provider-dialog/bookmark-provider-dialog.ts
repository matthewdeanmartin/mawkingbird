import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FocusTrap } from '../a11y/focus-trap';

// i18n bookmarkProvider.title: Where should this bookmark go?
// i18n bookmarkProvider.close: Close
// i18n bookmarkProvider.browser: This browser
// i18n bookmarkProvider.removeNative: Remove the native bookmark
// i18n bookmarkProvider.saveNative: Save the native bookmark
// i18n bookmarkProvider.savePost: Save the post
// i18n bookmarkProvider.publicUrl: Bookmark the post's public URL
// i18n bookmarkProvider.unwrap: Unwrap and save the first link
// i18n bookmarkProvider.noLink: No external link was found in this post.
// i18n bookmarkProvider.raindrop: Raindrop.io

export type BookmarkChoice = 'mastodon' | 'raindrop-post' | 'raindrop-link';

/** Chooses between native and Raindrop.io bookmark destinations. */
@Component({
  selector: 'app-bookmark-provider-dialog',
  imports: [FocusTrap, TranslocoPipe],
  templateUrl: './bookmark-provider-dialog.html',
  styleUrl: './bookmark-provider-dialog.css',
})
export class BookmarkProviderDialog {
  readonly nativeBookmarked = input(false);
  readonly anonymous = input(false);
  readonly nativeLabel = input('Mastodon');
  readonly externalUrl = input<string | null>(null);
  readonly chosen = output<BookmarkChoice>();
  readonly closed = output<void>();

  protected hostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}
