import { effect, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { Api } from '../platform/api/api';
import { CustomEmoji } from '../platform/api/models';
import { Server } from '../platform/http/server';
import { Auth } from '../platform/session/auth';
import { MisskeyApi } from '../connections/misskey/misskey-api';
import { misskeyIdentity } from '../connections/misskey/misskey-identity-store';

/**
 * Lazily-loaded cache of the instance's custom emojis, shared by the
 * composer preview and the emoji picker. A failed fetch (older instance,
 * offline) just means an empty list — both features degrade gracefully.
 */
@Injectable({ providedIn: 'root' })
export class CustomEmojis {
  private api = inject(Api);
  private server = inject(Server);
  private auth = inject(Auth);
  private misskey = inject(MisskeyApi);
  private requested = false;
  private loadedServer: string | null = null;
  private request?: Subscription;

  readonly emojis = signal<CustomEmoji[]>([]);

  constructor() {
    effect(() => {
      this.server.baseUrl();
      this.auth.activeMisskeyKey();
      if (this.requested) this.ensureLoaded();
    });
  }

  /** Kick off the fetch (once); read results from `emojis`. */
  ensureLoaded(): void {
    // A Misskey account's emoji are its Misskey server's, not a Mastodon server's.
    const misskeyServer = misskeyIdentity(this.auth.activeMisskeyKey())?.profile.server ?? null;
    const server = misskeyServer ? `misskey:${misskeyServer}` : this.server.baseUrl();
    if (this.loadedServer === server) {
      return;
    }
    this.requested = true;
    this.loadedServer = server;
    this.request?.unsubscribe();
    this.emojis.set([]);
    if (misskeyServer) {
      this.request = this.misskey.emojis(misskeyServer).subscribe({
        next: ({ emojis }) =>
          this.emojis.set(
            emojis
              .filter((emoji) => !emoji.isSensitive)
              .map((emoji) => ({
                shortcode: emoji.name,
                url: emoji.url,
                static_url: emoji.url,
                visible_in_picker: true,
                ...(emoji.category ? { category: emoji.category } : {}),
              })),
          ),
        error: () => this.emojis.set([]),
      });
      return;
    }
    this.request = this.api.customEmojis().subscribe({
      next: (list) => this.emojis.set(list),
      error: () => this.emojis.set([]),
    });
  }
}
