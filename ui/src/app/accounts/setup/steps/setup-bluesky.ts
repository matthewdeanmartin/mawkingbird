import { Component } from '@angular/core';
import { BridgeFriendsImport } from '../../../settings/import-export/bridge-friends-import';

/** The Bluesky ⇄ Mastodon finder, as Settings → Import/Export renders it. */
@Component({
  selector: 'app-setup-bluesky',
  imports: [BridgeFriendsImport],
  template: `<app-bridge-friends-import [connectInline]="true" />`,
  styleUrl: './setup-steps.css',
})
export class SetupBluesky {}
