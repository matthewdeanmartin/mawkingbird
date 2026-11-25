import { computed, inject, Injectable } from '@angular/core';
import { Auth } from '../../platform/session/auth';
import { MastodonConnector } from './mastodon-connector';

/**
 * Who the reader is on Mastodon, as their identity or as a Bluesky account's
 * connector.
 *
 * `Auth.account()` answers who they are in the app: under a connector that is
 * their Bluesky profile, whose id means nothing to a Mastodon server. Code that
 * passes "my own id" to the Mastodon API wants this instead.
 */
@Injectable({ providedIn: 'root' })
export class MastodonMe {
  private readonly auth = inject(Auth);
  private readonly connector = inject(MastodonConnector);

  readonly account = computed(() => {
    if (!this.auth.isBlueskyPrimary) return this.auth.account() ?? null;
    const connector = this.connector.current();
    return connector.state === 'signed-in' ? connector.account : null;
  });
}
