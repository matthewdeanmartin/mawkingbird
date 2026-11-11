import { MbField, MbControl } from '../../design-system/field/field';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { AppDialogs } from '../../app-dialogs';
import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../admin-api';
import { Announcement } from '../../models';
import { Server } from '../../server';
import { MbNotice } from '../../design-system/notice/notice';

// i18n adminAnnouncements.placeholder: Announcement text (HTML allowed)
// i18n adminAnnouncements.publishImmediately: Publish immediately
// i18n adminAnnouncements.create: Create
// i18n adminAnnouncements.loading: Loading…
// i18n adminAnnouncements.empty: No announcements.
// i18n adminAnnouncements.published: Published
// i18n adminAnnouncements.draft: Draft
// i18n adminAnnouncements.unpublish: Unpublish
// i18n adminAnnouncements.publish: Publish
// i18n adminAnnouncements.delete: Delete

// i18n adminAnnouncements.webOnly: Mastodon manages announcements only on its own admin pages; there is no API an app can use. Open them on your server:
// i18n adminAnnouncements.openOnServer: Open announcements on {{host}} ↗

/**
 * Staff management of instance announcements: list / create / publish / delete.
 *
 * Only the local mock implements an announcements admin API. Real Mastodon has
 * none (announcements live in its Rails admin), so against a real server this
 * page links there instead of calling endpoints that do not exist.
 */
@Component({
  selector: 'app-admin-announcements',
  imports: [MbField, MbControl, MbButton, MbCheckbox, MbNotice, FormsModule, TranslocoPipe],
  templateUrl: './admin-announcements.html',
  styleUrl: './admin-announcements.css',
})
export class AdminAnnouncements implements OnInit {
  private readonly dialogs = inject(AppDialogs);

  private api = inject(AdminApi);
  private server = inject(Server);

  /** True on a real server, where only its web admin can manage announcements. */
  protected readonly webOnly = !this.server.isMock;
  protected readonly serverAdminUrl = `${this.server.baseUrl()}/admin/announcements`;
  protected readonly host = this.server.baseUrl().replace(/^https?:\/\//, '');

  protected announcements = signal<Announcement[]>([]);
  protected loading = signal(true);

  protected newText = signal('');
  protected publishNow = signal(true);
  protected submitting = signal(false);
  protected saveFailed = signal(false);

  ngOnInit(): void {
    if (!this.webOnly) this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.announcements().subscribe({
      next: (a) => {
        this.announcements.set(a);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  create(): void {
    const text = this.newText().trim();
    if (!text || this.submitting()) {
      return;
    }
    this.saveFailed.set(false);
    this.submitting.set(true);
    this.api.createAnnouncement(text, this.publishNow()).subscribe({
      next: (a) => {
        this.announcements.update((list) => [a, ...list]);
        this.newText.set('');
        this.submitting.set(false);
      },
      error: () => {
        this.submitting.set(false);
        this.saveFailed.set(true);
      },
    });
  }

  private replace(updated: Announcement): void {
    this.announcements.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
  }

  togglePublished(a: Announcement): void {
    const call = a.published
      ? this.api.unpublishAnnouncement(a.id)
      : this.api.publishAnnouncement(a.id);
    call.subscribe((u) => this.replace(u));
  }

  async remove(a: Announcement): Promise<void> {
    if (!(await this.dialogs.confirm('Delete this announcement?'))) {
      return;
    }
    this.api.deleteAnnouncement(a.id).subscribe(() => {
      this.announcements.update((list) => list.filter((x) => x.id !== a.id));
    });
  }
}
