import { inject, Injectable, signal } from '@angular/core';
import { Api } from './api';
import { CustomEmoji } from './models';

/**
 * Lazily-loaded cache of the instance's custom emojis, shared by the
 * composer preview and the emoji picker. A failed fetch (older instance,
 * offline) just means an empty list — both features degrade gracefully.
 */
@Injectable({ providedIn: 'root' })
export class CustomEmojis {
  private api = inject(Api);
  private requested = false;

  readonly emojis = signal<CustomEmoji[]>([]);

  /** Kick off the fetch (once); read results from `emojis`. */
  ensureLoaded(): void {
    if (this.requested) {
      return;
    }
    this.requested = true;
    this.api.customEmojis().subscribe({
      next: (list) => this.emojis.set(list.filter((e) => e.visible_in_picker !== false)),
      error: () => this.emojis.set([]),
    });
  }
}
