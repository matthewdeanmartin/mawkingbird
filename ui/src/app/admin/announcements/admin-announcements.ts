import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../admin-api';
import { Announcement } from '../../models';

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

/** Staff management of instance announcements: list / create / publish / delete. */
@Component({
  selector: 'app-admin-announcements',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './admin-announcements.html',
  styleUrl: './admin-announcements.css',
})
export class AdminAnnouncements implements OnInit {
  private api = inject(AdminApi);

  protected announcements = signal<Announcement[]>([]);
  protected loading = signal(true);

  protected newText = signal('');
  protected publishNow = signal(true);
  protected submitting = signal(false);

  ngOnInit(): void {
    this.load();
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
    this.submitting.set(true);
    this.api.createAnnouncement(text, this.publishNow()).subscribe({
      next: (a) => {
        this.announcements.update((list) => [a, ...list]);
        this.newText.set('');
        this.submitting.set(false);
      },
      error: () => this.submitting.set(false),
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

  remove(a: Announcement): void {
    if (!confirm('Delete this announcement?')) {
      return;
    }
    this.api.deleteAnnouncement(a.id).subscribe(() => {
      this.announcements.update((list) => list.filter((x) => x.id !== a.id));
    });
  }
}
