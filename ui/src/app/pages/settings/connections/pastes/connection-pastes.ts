import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PasteProviderRegistry } from '../../../../providers/paste/paste-provider-registry';
import { PasteSettings } from '../../../../providers/paste/paste-settings';
import { PasteFeedSubscriptions } from '../../../../providers/paste/paste-feed-subscriptions';
import { PasteFeedFetch } from '../../../../providers/paste/paste-feed-fetch';
import { FeedPasteProvider } from '../../../../providers/paste/paste-provider';
import { PASTE_SERVICES } from '../../../../providers/publishing-services';

// i18n settings.connections.pastes.title: Paste services
// i18n settings.connections.pastes.intro: Choose the default service for new pastes. You can switch services later or choose a different one in the composer. Existing pastes and drafts stay with their original service.
// i18n settings.connections.pastes.privacy: Publishing a paste creates a page anyone with its link can read. Use Drafts to keep unfinished writing private.
// i18n settings.connections.pastes.active: Default
// i18n settings.connections.pastes.use: Make default
// i18n settings.connections.pastes.setup: Configure service
// i18n settings.connections.pastes.needsSetup: Set up this service before making it the default.
// i18n settings.connections.pastes.ready: Ready to use
// i18n settings.connections.pastes.editable: Supports editing and remote deletion
// i18n settings.connections.pastes.immutable: Paste editing and remote deletion are unavailable here
// i18n settings.connections.pastes.expiry: Expiry options
// i18n settings.connections.pastes.history: Manage my pastes
// i18n settings.connections.pastes.doctor: Check network access
// i18n settings.connections.pastes.saveFailed: The default could not be saved in this browser. Free some site storage and try again.
// i18n settings.connections.pastes.unavailable: Your preferred service needs setup. New pastes currently default to Rentry.
// i18n settings.connections.pastes.feeds: Public paste feeds
// i18n settings.connections.pastes.feedIntro: Following a public feed adds it to Home for this account. Proxy access is optional and shares the feed address and contents with your proxy.
// i18n settings.connections.pastes.follow: Follow
// i18n settings.connections.pastes.unfollow: Unfollow
// i18n settings.connections.pastes.proxy: Use my configured CORS proxy
@Component({
  selector: 'app-connection-pastes',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './connection-pastes.html',
  styleUrls: ['../connection-page.css', '../link-shortener/connection-link-shortener.css'],
})
export class ConnectionPastes {
  protected readonly registry = inject(PasteProviderRegistry);
  protected readonly settings = inject(PasteSettings);
  protected readonly feeds = inject(PasteFeedSubscriptions);
  protected readonly feedFetch = inject(PasteFeedFetch);
  protected readonly failed = signal(false);
  protected readonly selected = signal(this.settings.selected());
  protected readonly entry = computed(
    () => this.registry.get(this.selected()) ?? this.registry.default,
  );

  ready(id: string): boolean {
    return this.registry.available().some((item) => item.id === id);
  }

  setup(id: string): string | null {
    return PASTE_SERVICES.find((item) => item.id === id)?.setup ?? null;
  }

  activate(id: string): void {
    if (this.ready(id)) this.failed.set(!this.settings.select(id));
  }

  toggleFeed(provider: FeedPasteProvider): void {
    if (this.feeds.has(provider.id)) this.feeds.unfollow(provider.id);
    else this.feeds.follow(provider.id, provider.feedUrl, provider.label);
  }
}
