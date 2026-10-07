import { effect, inject, Injectable } from '@angular/core';
import { Auth } from '../auth';
import { Server } from '../server';

export interface PlaybackPosition {
  time: number;
  volume: number;
  muted: boolean;
  rate: number;
}

export interface PlaybackHandle {
  pause(): void;
  position(): PlaybackPosition;
}

/** Session-only handoff. No history, play intent, queues, or automatic resuming. */
@Injectable({ providedIn: 'root' })
export class Playback {
  private auth = inject(Auth);
  private server = inject(Server);
  private handles = new Set<PlaybackHandle>();
  private positions = new Map<string, PlaybackPosition>();

  constructor() {
    effect(() => {
      this.auth.kind();
      this.auth.account();
      this.auth.token();
      this.server.baseUrl();
      this.stopAll();
      this.positions.clear();
    });
  }

  register(handle: PlaybackHandle): () => void {
    this.handles.add(handle);
    return () => {
      handle.pause();
      this.handles.delete(handle);
    };
  }

  started(handle: PlaybackHandle): void {
    for (const other of this.handles) if (other !== handle) other.pause();
  }

  stopAll(): void {
    for (const handle of this.handles) handle.pause();
  }

  handoff(key: string, handle: PlaybackHandle): void {
    this.positions.set(key, handle.position());
    handle.pause();
    if (this.positions.size > 20) this.positions.delete(this.positions.keys().next().value!);
  }

  take(key: string): PlaybackPosition | undefined {
    const position = this.positions.get(key);
    this.positions.delete(key);
    return position;
  }
}
