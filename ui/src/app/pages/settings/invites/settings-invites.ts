import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MockApi } from '../../../mock-api';
import { Invite } from '../../../models';
import { TranslocoPipe } from '@jsverse/transloco';

/** Invite links: generate, list, revoke. */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.invites.title: Invite links
// i18n settings.invites.intro: Generate invite links to share with people you know.
// i18n settings.invites.maxUses: Max number of uses
// i18n settings.invites.uses.none: No limit
// i18n settings.invites.uses.1: 1 use
// i18n settings.invites.uses.5: 5 uses
// i18n settings.invites.uses.10: 10 uses
// i18n settings.invites.uses.25: 25 uses
// i18n settings.invites.expire: Expire after
// i18n settings.invites.expire.never: Never
// i18n settings.invites.expire.min30: 30 minutes
// i18n settings.invites.expire.hour1: 1 hour
// i18n settings.invites.expire.day1: 1 day
// i18n settings.invites.expire.week1: 1 week
// i18n settings.invites.generate: Generate invite link
// i18n settings.invites.generating: Generating…
// i18n settings.invites.col.link: Link
// i18n settings.invites.col.uses: Uses
// i18n settings.invites.col.expires: Expires
// i18n settings.invites.col.created: Created
// i18n settings.invites.col.status: Status
// i18n settings.invites.revoked: Revoked
// i18n settings.invites.active: Active
// i18n settings.invites.revoke: Revoke
// i18n settings.invites.none: No invites yet.
@Component({
  selector: 'app-settings-invites',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './settings-invites.html',
  styleUrl: './settings-invites.css',
})
export class SettingsInvites implements OnInit {
  private api = inject(MockApi);

  protected invites = signal<Invite[]>([]);
  protected maxUses = signal<number | null>(null);
  protected expiresIn = signal<number | null>(null);
  protected creating = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.api.invites().subscribe((list) => this.invites.set(list));
  }

  protected generate(): void {
    if (this.creating()) {
      return;
    }
    this.creating.set(true);
    this.api.createInvite({ max_uses: this.maxUses(), expires_in: this.expiresIn() }).subscribe({
      next: () => {
        this.creating.set(false);
        this.load();
      },
      error: () => this.creating.set(false),
    });
  }

  protected revoke(invite: Invite): void {
    this.api.revokeInvite(invite.id).subscribe((updated) => {
      this.invites.update((list) => list.map((i) => (i.id === updated.id ? updated : i)));
    });
  }

  protected formatDate(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString() : 'Never';
  }
}
