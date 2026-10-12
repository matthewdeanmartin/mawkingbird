import { effect, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { Api } from './api';
import { CustomEmoji } from './models';
import { Server } from './server';

/**
 * Lazily-loaded cache of the instance's custom emojis, shared by the
 * composer preview and the emoji picker. A failed fetch (older instance,
 * offline) just means an empty list — both features degrade gracefully.
 */
@Injectable({ providedIn: 'root' })
export class CustomEmojis {
  private api = inject(Api);
  private server = inject(Server);
  private requested = false;
  private loadedServer: string | null = null;
  private request?: Subscription;

  readonly emojis = signal<CustomEmoji[]>([]);

  constructor() {
    effect(() => {
      this.server.baseUrl();
      if (this.requested) this.ensureLoaded();
    });
  }

  /** Kick off the fetch (once); read results from `emojis`. */
  ensureLoaded(): void {
    const server = this.server.baseUrl();
    if (this.loadedServer === server) {
      return;
    }
    this.requested = true;
    this.loadedServer = server;
    this.request?.unsubscribe();
    this.emojis.set([]);
    this.request = this.api.customEmojis().subscribe({
      next: (list) => this.emojis.set(list),
      error: () => this.emojis.set([]),
    });
  }
}
