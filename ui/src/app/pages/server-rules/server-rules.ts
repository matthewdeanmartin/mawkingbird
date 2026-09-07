import { Component, computed, inject, OnInit } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { SearchServer } from '../../search-server';
import { SearchServerAbout } from '../../search-server-about';
import { ServerAbout } from '../../server-about';

// i18n serverRules.title: Server rules
// i18n serverRules.bySearch: Rules published by {{host}}, your search server.
// i18n serverRules.byMastodon: Rules published by this Mastodon server.
// i18n serverRules.loading: Loading server rules…
// i18n serverRules.empty: This server has not published any rules.

/**
 * Rules published by a connected Mastodon instance. `?server=search` renders the
 * search server's rules instead of the primary one's (see Terms for why).
 */
@Component({
  selector: 'app-server-rules',
  templateUrl: './server-rules.html',
  styleUrl: './server-rules.css',
  imports: [TranslocoPipe],
})
export class ServerRules implements OnInit {
  private serverAbout = inject(ServerAbout);
  private searchServerAbout = inject(SearchServerAbout);
  private searchServer = inject(SearchServer);
  private route = inject(ActivatedRoute);

  private params = toSignal(this.route.queryParamMap, { initialValue: null });
  protected isSearchServer = computed(() => this.params()?.get('server') === 'search');

  protected rules = computed(() =>
    this.isSearchServer() ? this.searchServerAbout.rules() : this.serverAbout.rules(),
  );
  protected loading = computed(() =>
    this.isSearchServer() ? this.searchServerAbout.loading() : this.serverAbout.loading(),
  );
  protected host = computed(() => (this.isSearchServer() ? this.searchServer.host() : null));

  ngOnInit(): void {
    this.serverAbout.load();
    this.searchServerAbout.load();
  }
}
