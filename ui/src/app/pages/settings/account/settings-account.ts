import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../../api';
import { Server } from '../../../server';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Account: username, password, sessions note. Password "changes" are simulated on the
 * mock only; real Mastodon has no client API for this, so against a real instance we
 * link to its /auth/edit page instead.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.account.title: Account
// i18n settings.account.intro: Your account identity and security settings.
// i18n settings.account.username: Username
// i18n settings.account.username.hint: Your username is unique on this server and cannot be changed.
// i18n settings.account.currentPassword: Current password
// i18n settings.account.newPassword: New password
// i18n settings.account.confirmPassword: Confirm new password
// i18n settings.account.mockNote: Password changes are simulated in this mock — nothing is stored.
// i18n settings.account.password: Password
// i18n settings.account.password.hint: Mastodon has no client API for changing passwords — that happens on your instance's own website.
// i18n settings.account.password.link: Change your password on {{host}} ↗
// i18n settings.account.sessions: Sessions
// i18n settings.account.sessions.mock: Session management is not implemented in the mock.
// i18n settings.account.sessions.hint: Mastodon has no client API for listing or revoking sessions — manage them on your instance's own website.
// i18n settings.account.sessions.link: Manage sessions on {{host}} ↗
// i18n settings.account.changePassword: Change password
@Component({
  selector: 'app-settings-account',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './settings-account.html',
})
export class SettingsAccount implements OnInit {
  private api = inject(Api);
  private server = inject(Server);

  protected readonly isMock = this.server.isMock;
  protected readonly passwordChangeUrl = `${this.server.baseUrl()}/auth/edit`;
  protected readonly instanceHost = this.server.baseUrl().replace(/^https?:\/\//, '');

  protected acct = signal('');
  protected currentPassword = signal('');
  protected newPassword = signal('');
  protected confirmPassword = signal('');
  protected passwordError = signal('');
  protected saving = signal(false);
  protected saved = signal(false);

  ngOnInit(): void {
    this.api.verifyCredentials().subscribe((acc) => {
      this.acct.set(acc.acct);
    });
  }

  protected changePassword(): void {
    this.saved.set(false);
    if (this.newPassword() !== this.confirmPassword()) {
      this.passwordError.set('New password and confirmation do not match.');
      return;
    }
    this.passwordError.set('');
    // The mock has no password store; the "change" succeeds client-side only.
    this.currentPassword.set('');
    this.newPassword.set('');
    this.confirmPassword.set('');
    this.saved.set(true);
  }
}
