import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbContentLink } from '../design-system/metadata/metadata';
// i18n connectionHelp.certificates: Certificate & local network help
// i18n connectionHelp.doctor: Network Doctor
// i18n connectionHelp.localHint: On your local network. Allow this app local network access when prompted; connecting can take up to 15 seconds.
// i18n connectionHelp.connectLocal: Connect to local server
@Component({
  selector: 'app-server-connection-help',
  imports: [RouterLink, TranslocoPipe, MbContentLink],
  template: `<p class="small">
    <a mbContentLink routerLink="/connection-help" [queryParams]="{ server: server() }">{{
      'connectionHelp.certificates' | transloco
    }}</a>
    ·
    <a mbContentLink routerLink="/connection-doctor" [queryParams]="{ server: server() }">{{
      'connectionHelp.doctor' | transloco
    }}</a>
  </p>`,
})
export class ServerConnectionHelp {
  readonly server = input('');
}

// i18n connectionHelp.localCategory: Local network · ESP32
// i18n connectionHelp.localDescription: Your Mastomini on this local network. Browser permission and a trusted certificate may be needed.
