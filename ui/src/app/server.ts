import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';
import { normalizeHostUrl } from './host-url';

const SERVER_KEY = 'mastodon_mock_server';

export interface ServerPreset {
  label: string;
  /** Empty string means "this server" (relative URLs, same origin as the UI). */
  baseUrl: string;
}

/**
 * Presets offered on the login screen. The "this server" entry only makes sense for the
 * mock-embedded build (the UI is served by the mock); the standalone Mocking Bird client
 * drops it so the user must choose a real instance.
 */
export const SERVER_PRESETS: ServerPreset[] = [
  ...(environment.allowThisServer ? [{ label: 'This server (mastodon_mock)', baseUrl: '' }] : []),
  { label: 'mastodon.social', baseUrl: 'https://mastodon.social' },
];

/** Holds the chosen instance base URL, persisted across reloads. */
@Injectable({ providedIn: 'root' })
export class Server {
  readonly baseUrl = signal<string>(this.normalize(localStorage.getItem(SERVER_KEY) ?? ''));

  /**
   * True when the build is allowed to target its own origin (the mock-embedded UI).
   * Mocking Bird sets this false: there is no own server, an instance must be picked.
   */
  readonly allowsThisServer = environment.allowThisServer;

  /** True when targeting the local mock (relative URLs / same origin as the UI). */
  get isMock(): boolean {
    return this.baseUrl() === '';
  }

  setBaseUrl(value: string): void {
    const normalized = this.normalize(value);
    localStorage.setItem(SERVER_KEY, normalized);
    this.baseUrl.set(normalized);
  }

  private normalize(value: string): string {
    return normalizeHostUrl(value);
  }
}
