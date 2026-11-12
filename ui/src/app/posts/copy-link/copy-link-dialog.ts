import { Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../design-system/field/field';

// i18n copyLink.title: Copy link
// i18n copyLink.account: Account
// i18n copyLink.copy: Copy
// i18n copyLink.copied: Copied
// i18n copyLink.copyAria: Copy the {{what}} link
// i18n copyLink.close: Close
// i18n copyLink.hint: Links open in Mawkingbird for anyone, on any server.

/**
 * Two rows, nothing else: the post (in the reader's own word for it) and its
 * author, each a mawkingbird.com link with a Copy button. Rows without a link
 * are left out; a profile page passes only the account.
 */
@Component({
  selector: 'app-copy-link-dialog',
  imports: [MbDialog, MbButton, MbField, MbControl, TranslocoPipe],
  templateUrl: './copy-link-dialog.html',
  styleUrl: './copy-link-dialog.css',
})
export class CopyLinkDialog {
  /** "Post", "Tweet", "Toot"… from Terminology. */
  readonly postLabel = input('');
  readonly postUrl = input<string | null>(null);
  readonly accountUrl = input<string | null>(null);
  readonly closed = output<void>();

  protected readonly copied = signal<'post' | 'account' | null>(null);

  protected async copy(which: 'post' | 'account', url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(which);
    } catch {
      this.copied.set(null);
    }
  }

  /** Selecting the whole link on focus makes manual copy one keystroke where the clipboard API is refused. */
  protected selectAll(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }
}
