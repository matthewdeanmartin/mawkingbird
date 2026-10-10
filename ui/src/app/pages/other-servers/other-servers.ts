import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbField, MbControl } from '../../design-system/field/field';
import { MbButton } from '../../design-system/button/button';
import { MastodonServers } from '../../mastodon-servers';
import { SERVER_FEEDS } from '../../lists/server-feeds';
import { otherServerHost } from '../../other-server-url';

// i18n otherServers.heading: Other Servers
// i18n otherServers.back: ← Feeds
// i18n otherServers.backToServers: ← Other Servers
// i18n otherServers.intro: Browse public feeds from another Mastodon server.
// i18n otherServers.search: Search servers
// i18n otherServers.searchPlaceholder: Search by domain, topic, or description
// i18n otherServers.loading: Loading servers…
// i18n otherServers.empty: No matching servers. You can enter a server domain below.
// i18n otherServers.customLabel: Server domain
// i18n otherServers.customPlaceholder: foobar.social
// i18n otherServers.browse: Browse server
// i18n otherServers.publicOnly: These are public feeds from {{server}}. Some servers require their own account to browse a timeline.
// i18n otherServers.invalid: This server address is invalid. Choose a server from the directory.
@Component({
  selector: 'app-other-servers',
  imports: [FormsModule, RouterLink, TranslocoPipe, MbButton, MbField, MbControl],
  templateUrl: './other-servers.html',
  styleUrl: './other-servers.css',
})
export class OtherServers implements OnInit {
  protected directory = inject(MastodonServers);
  readonly server = input<string | null>(null);
  protected selected = computed(() => otherServerHost(this.server()));
  protected invalid = computed(() => !!this.server() && !this.selected());
  protected query = signal('');
  protected custom = signal('');
  protected customHost = computed(() => otherServerHost(this.custom()));
  protected feeds = SERVER_FEEDS;
  protected servers = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.directory
      .servers()
      .filter(
        (server) =>
          otherServerHost(server.domain) &&
          `${server.domain} ${server.description} ${server.category}`.toLowerCase().includes(query),
      )
      .slice()
      .sort((a, b) => a.domain.localeCompare(b.domain));
  });

  ngOnInit(): void {
    if (!this.selected()) void this.directory.ready();
  }
}

/** Route wrapper keeps the reusable Feeds section independent of router params. */
@Component({
  selector: 'app-other-servers-page',
  imports: [OtherServers],
  template: `<app-other-servers [server]="host()" />`,
})
export class OtherServersPage {
  private route = inject(ActivatedRoute);
  protected host = toSignal(this.route.paramMap.pipe(map((params) => params.get('server'))), {
    initialValue: null,
  });
}
