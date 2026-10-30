import { Component, inject } from '@angular/core';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import { ContactDiscovery } from '../settings/import-export/contact-discovery';
import { ContactFriendsImport } from '../settings/import-export/contact-friends-import';

/**
 * The signed-in body of /find-contacts-on-mastodon: the shared contacts finder,
 * then the next steps once a search has spent its first call. Inviting the
 * people who were not found is the natural next thing, so the cards wait for it.
 */
@Component({
  selector: 'app-contacts-workbench',
  imports: [ContactFriendsImport, FocusedNextSteps],
  template: `
    <app-contact-friends-import />
    @if (discovery.callCount() > 0) {
      <app-focused-next-steps inviteLink="/find-contacts-on-mastodon/invite" />
    }
  `,
})
export class ContactsWorkbench {
  protected readonly discovery = inject(ContactDiscovery);
}
