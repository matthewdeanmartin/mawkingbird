import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MockApi } from '../../../mock-api';
import { EmailNotificationSettings } from '../../../models';
import { TranslocoPipe } from '@jsverse/transloco';

/** Email notification toggles (mock-only settings section). */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.notifications.title: Email notifications
// i18n settings.notifications.intro: Choose which events send you an e-mail.
// i18n settings.notifications.events: Events
// i18n settings.notifications.follow: Someone followed you
// i18n settings.notifications.followRequest: Someone requested to follow you
// i18n settings.notifications.reblog: Someone boosted your post
// i18n settings.notifications.favourite: Someone favourited your post
// i18n settings.notifications.mention: Someone mentioned you
// i18n settings.notifications.report: A new report is submitted
// i18n settings.notifications.report.hint: Moderators only.
// i18n settings.notifications.digest: Digest
// i18n settings.notifications.digest.label: Send digest e-mails of missed activity
@Component({
  selector: 'app-settings-notifications',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './settings-notifications.html',
})
export class SettingsNotifications implements OnInit {
  private api = inject(MockApi);

  protected follow = signal(false);
  protected followRequest = signal(false);
  protected reblog = signal(false);
  protected favourite = signal(false);
  protected mention = signal(false);
  protected report = signal(false);
  protected digest = signal(false);
  protected saving = signal(false);
  protected saved = signal(false);

  ngOnInit(): void {
    this.api.mockSettings().subscribe((settings) => {
      const n = settings.email_notifications;
      this.follow.set(n.follow);
      this.followRequest.set(n.follow_request);
      this.reblog.set(n.reblog);
      this.favourite.set(n.favourite);
      this.mention.set(n.mention);
      this.report.set(n.report);
      this.digest.set(n.digest);
    });
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saved.set(false);

    const emailNotifications: EmailNotificationSettings = {
      follow: this.follow(),
      follow_request: this.followRequest(),
      reblog: this.reblog(),
      favourite: this.favourite(),
      mention: this.mention(),
      report: this.report(),
      digest: this.digest(),
    };

    this.api.updateMockSettings({ email_notifications: emailNotifications }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
      },
      error: () => this.saving.set(false),
    });
  }
}
