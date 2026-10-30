import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { ContactsWorkbench } from './contacts-workbench';

/**
 * "Find my contacts on Mastodon" as a focused mini-app: the contacts finder from
 * Settings → Import/Export, behind a Mastodon sign-in.
 *
 * The finder also works anonymously in Settings, but this page signs in first
 * like the other tools (owner decision, sprint/seo-tools-2026-10-30.md), so a
 * match followed here is a real follow on the visitor's account.
 */
@Component({
  selector: 'app-find-contacts-on-mastodon',
  imports: [RouterLink, MbButton, MbContentLink, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class FindContactsOnMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/find-contacts-on-mastodon' };
}
