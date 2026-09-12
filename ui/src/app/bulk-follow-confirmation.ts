import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

// i18n bulkFollow.confirm: Follow {{count}} accounts or topics? Accounts may receive follow notifications or follow requests.
// i18n bulkFollow.feeds: Follow {{count}} feeds?
@Injectable({ providedIn: 'root' })
export class BulkFollowConfirmation {
  private readonly i18n = inject(TranslocoService);

  allow(count: number, anonymous = false, kind: 'accounts' | 'feeds' = 'accounts'): boolean {
    return (
      count > 0 &&
      (anonymous ||
        window.confirm(
          this.i18n.translate(kind === 'feeds' ? 'bulkFollow.feeds' : 'bulkFollow.confirm', {
            count,
          }),
        ))
    );
  }
}
