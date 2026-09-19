import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AppDialogs } from './app-dialogs';

// i18n bulkFollow.title: Follow {{count}} accounts or topics?
// i18n bulkFollow.warning: Accounts may receive follow notifications or follow requests. Unfollowing later won't take those notifications back.
// i18n bulkFollow.feeds: Follow {{count}} feeds?
// i18n bulkFollow.action: Follow {{count}}
@Injectable({ providedIn: 'root' })
export class BulkFollowConfirmation {
  private readonly i18n = inject(TranslocoService);
  private readonly dialogs = inject(AppDialogs);
  private pending = false;

  async allow(
    count: number,
    anonymous = false,
    kind: 'accounts' | 'feeds' = 'accounts',
  ): Promise<boolean> {
    if (count <= 0 || this.pending) return false;
    if (anonymous) return true;
    this.pending = true;
    try {
      return await this.dialogs.confirm(
        kind === 'accounts' ? this.i18n.translate('bulkFollow.warning') : '',
        {
          title: this.i18n.translate(kind === 'feeds' ? 'bulkFollow.feeds' : 'bulkFollow.title', {
            count,
          }),
          confirmLabel: this.i18n.translate('bulkFollow.action', { count }),
        },
      );
    } finally {
      this.pending = false;
    }
  }
}
