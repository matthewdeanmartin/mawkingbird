import { AppDialogs } from './app-dialogs';
import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ClientPrefs } from './client-prefs';
import { Pseudonymity } from './pseudonymity';

// i18n pseudonymity.postReminder: Pseudonymity mode is on for {{account}}. Before posting, check that your text and attachments don't reveal personal information. Do you want to post? You can disable this reminder in Settings → Advanced → Pseudonymity.
// i18n pseudonymity.postConfirm: Do you really want to post that?
// i18n pseudonymity.currentAccount: this account

/** One confirmation per publish attempt, shared by Write and the reply composer. */
@Injectable({ providedIn: 'root' })
export class PostConfirmation {
  private readonly dialogs = inject(AppDialogs);

  private prefs = inject(ClientPrefs);
  private pseudonymity = inject(Pseudonymity);
  private transloco = inject(TranslocoService);

  confirm(account?: string): boolean | Promise<boolean> {
    const pa = this.pseudonymity.enabled();
    if (!(pa ? this.pseudonymity.reminder() : this.prefs.confirmBeforePost())) return true;
    return this.dialogs.confirm(
      pa
        ? this.transloco.translate('pseudonymity.postReminder', {
            account: account || this.transloco.translate('pseudonymity.currentAccount'),
          })
        : this.transloco.translate('pseudonymity.postConfirm'),
    );
  }
}
