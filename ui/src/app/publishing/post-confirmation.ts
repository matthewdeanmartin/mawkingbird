import { AppDialogs } from '../shell/app-dialogs';
import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ClientPrefs } from '../platform/storage/client-prefs';
import { Pseudonymity } from '../accounts/pseudonymity';

// i18n pseudonymity.postReminder: Pseudonymity mode is on for {{account}}. Check your text and attachments for personal information. Post now? You can turn this reminder off in Settings → Advanced → Pseudonymity.
// i18n pseudonymity.postConfirm: Do you really want to post that?
// i18n pseudonymity.currentAccount: this account
// i18n compose.confirmPrivate: Send this private message? Only the people @-mentioned get it. Fediverse messages aren't encrypted, so server admins can read them.

/** One confirmation per publish attempt, shared by Write and the reply composer. */
@Injectable({ providedIn: 'root' })
export class PostConfirmation {
  private readonly dialogs = inject(AppDialogs);

  private prefs = inject(ClientPrefs);
  private pseudonymity = inject(Pseudonymity);
  private transloco = inject(TranslocoService);

  /**
   * `visibility` picks the wording: a private message carries different risks
   * from a public post (who can read it, who receives it), so it gets its own.
   */
  confirm(account?: string, visibility?: string): boolean | Promise<boolean> {
    const pa = this.pseudonymity.enabled();
    if (!(pa ? this.pseudonymity.reminder() : this.prefs.confirmBeforePost())) return true;
    return this.dialogs.confirm(
      pa
        ? this.transloco.translate('pseudonymity.postReminder', {
            account: account || this.transloco.translate('pseudonymity.currentAccount'),
          })
        : this.transloco.translate(
            visibility === 'direct' ? 'compose.confirmPrivate' : 'pseudonymity.postConfirm',
          ),
    );
  }
}
