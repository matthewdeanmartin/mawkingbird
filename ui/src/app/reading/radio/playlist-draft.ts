import { effect, inject, Injectable, signal } from '@angular/core';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import type { RadioTrack } from './radio-player';

/**
 * The playlist being built or edited. It is a document, not the queue: editing
 * it never changes what is playing, and playing it copies its tracks into the
 * player. Tab-lived; a saved copy lives in RadioPlaylists.
 */
@Injectable({ providedIn: 'root' })
export class PlaylistDraft {
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  readonly tracks = signal<RadioTrack[]>([]);
  readonly name = signal('');
  readonly description = signal('');

  constructor() {
    // Another account's draft is private data; start empty.
    let identity = this.identity();
    effect(() => {
      const next = this.identity();
      if (next !== identity) {
        identity = next;
        this.clear();
      }
    });
  }

  private identity(): string {
    return `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
  }

  /** Append tracks, skipping ones already in the draft; returns how many were added. */
  add(tracks: readonly RadioTrack[]): number {
    const keys = new Set(this.tracks().map((track) => track.key));
    const added = tracks.filter((track) => !keys.has(track.key) && !!keys.add(track.key));
    if (added.length) this.tracks.update((items) => [...items, ...added]);
    return added.length;
  }

  replace(tracks: readonly RadioTrack[], name = '', description = ''): void {
    const keys = new Set<string>();
    this.tracks.set(tracks.filter((track) => !keys.has(track.key) && !!keys.add(track.key)));
    this.name.set(name);
    this.description.set(description);
  }

  move(index: number, offset: number): void {
    const items = [...this.tracks()];
    const next = index + offset;
    if (!items[index] || !items[next]) return;
    [items[index], items[next]] = [items[next], items[index]];
    this.tracks.set(items);
  }

  /** Name an entry; an empty title restores the automatic one. */
  rename(index: number, title: string): void {
    this.tracks.update((items) =>
      items.map((item, i) => {
        if (i !== index) return item;
        const { title: _old, ...rest } = item;
        return title.trim() ? { ...rest, title: title.trim().slice(0, 200) } : rest;
      }),
    );
  }

  remove(index: number): void {
    this.tracks.update((items) => items.filter((_, i) => i !== index));
  }

  clear(): void {
    this.replace([]);
  }
}
