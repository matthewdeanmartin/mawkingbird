import { Component, computed, inject, OnInit } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { SearchServer } from '../../search-server';
import { SearchServerAbout } from '../../search-server-about';
import { ServerAbout } from '../../server-about';

// i18n terms.title: Terms of Service
// i18n terms.bySearch: Terms published by {{host}}, your search server.
// i18n terms.byMastodon: Terms published by this Mastodon server.
// i18n terms.loading: Loading terms…
// i18n terms.empty: This server has not published terms of service.

/**
 * Terms of service published by a connected Mastodon instance.
 *
 * `?server=search` renders the *search* server's terms instead of the primary
 * one's — with two servers in play the user has agreed to two sets of terms, and
 * Docs links to both through this one page.
 */
@Component({
  selector: 'app-terms',
  templateUrl: './terms.html',
  styleUrl: './terms.css',
  imports: [TranslocoPipe],
})
export class Terms implements OnInit {
  private serverAbout = inject(ServerAbout);
  private searchServerAbout = inject(SearchServerAbout);
  private searchServer = inject(SearchServer);
  private route = inject(ActivatedRoute);

  private params = toSignal(this.route.queryParamMap, { initialValue: null });
  protected isSearchServer = computed(() => this.params()?.get('server') === 'search');

  protected terms = computed(() =>
    this.isSearchServer() ? this.searchServerAbout.terms() : this.serverAbout.terms(),
  );
  protected loading = computed(() =>
    this.isSearchServer() ? this.searchServerAbout.loading() : this.serverAbout.loading(),
  );
  /** Host shown in the subtitle, so it's never ambiguous whose terms these are. */
  protected host = computed(() => (this.isSearchServer() ? this.searchServer.host() : null));

  ngOnInit(): void {
    this.serverAbout.load();
    this.searchServerAbout.load();
  }
}
