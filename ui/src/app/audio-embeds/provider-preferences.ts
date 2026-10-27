import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { accountScopeSuffix } from '../account-scope';
import { Auth } from '../auth';
import { Server } from '../server';
import { ExternalMedia } from './providers';

const KEY = 'mockingbird_audio_services';

/** Audio services a post may link. `paid`: full playback needs a subscription. */
export const AUDIO_SERVICES: readonly { id: string; label: string; paid: boolean }[] = [
  { id: 'apple-music', label: 'Apple Music', paid: true },
  { id: 'spotify', label: 'Spotify', paid: true },
  { id: 'youtube-music', label: 'YouTube Music', paid: true },
  { id: 'amazon-music', label: 'Amazon Music', paid: true },
  { id: 'tidal', label: 'TIDAL', paid: true },
  { id: 'deezer', label: 'Deezer', paid: true },
  { id: 'soundcloud', label: 'SoundCloud', paid: false },
  { id: 'mixcloud', label: 'Mixcloud', paid: false },
  { id: 'bandcamp', label: 'Bandcamp', paid: false },
  { id: 'apple-podcasts', label: 'Apple Podcasts', paid: false },
  { id: 'internet-archive', label: 'Internet Archive', paid: false },
  { id: 'audio-com', label: 'Audio.com', paid: false },
];
const PAID = new Set(AUDIO_SERVICES.filter((service) => service.paid).map((s) => s.id));

export interface ServicePreferences {
  /** Paid services the listener subscribes to. Never also hidden. */
  subscribed: readonly string[];
  /** Services whose players are never offered. Never also subscribed. */
  hidden: readonly string[];
  /** Offer every player that is not hidden, subscribed or not. */
  showAll: boolean;
}
export const DEFAULT_PREFERENCES: ServicePreferences = {
  subscribed: [],
  hidden: [],
  showAll: false,
};

/**
 * Which of a post's players to offer, best first. The rules, in order:
 *
 * 1. Hidden services are removed.
 * 2. With subscriptions recorded and Show all off, players for paid services
 *    the listener does not subscribe to are dropped, but only when the post
 *    also offers something they can play fully: a subscribed service or a
 *    free one. A post with only unsubscribed paid services keeps them, since
 *    they may still play previews and there is nothing better to show.
 * 3. Once subscriptions are recorded, subscribed services come first, then
 *    free ones, then the rest, keeping the post's own order within each group.
 *    Without any, the post's order stands.
 *
 * Video sources and services outside the catalogue pass through as free ones.
 */
export function arrangeSources(
  sources: readonly ExternalMedia[],
  prefs: ServicePreferences,
): ExternalMedia[] {
  const hidden = new Set(prefs.hidden);
  const subscribed = new Set(prefs.subscribed);
  const visible = sources.filter((source) => !hidden.has(source.provider));
  const rank = (source: ExternalMedia) =>
    subscribed.has(source.provider) ? 0 : PAID.has(source.provider) ? 2 : 1;
  const playable = visible.some((source) => rank(source) < 2);
  const prune = !prefs.showAll && subscribed.size > 0 && playable;
  return visible
    .filter((source) => !prune || rank(source) < 2)
    .map((source, index) => ({ source, index }))
    .sort((a, b) =>
      subscribed.size ? rank(a.source) - rank(b.source) || a.index - b.index : a.index - b.index,
    )
    .map((item) => item.source);
}

/** The listener's audio-service preferences, per account, for cards, Listen and Radio. */
@Injectable({ providedIn: 'root' })
export class ProviderPreferences {
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  readonly prefs = signal<ServicePreferences>(DEFAULT_PREFERENCES);

  constructor() {
    effect(() => {
      this.auth.kind();
      this.auth.token();
      this.server.baseUrl();
      untracked(() => this.load());
    });
  }

  arrange(sources: readonly ExternalMedia[]): ExternalMedia[] {
    return arrangeSources(sources, this.prefs());
  }
  isHidden(provider: string): boolean {
    return this.prefs().hidden.includes(provider);
  }

  /** Subscribing shows the service, so it leaves the hidden list. */
  setSubscribed(provider: string, value: boolean): void {
    const prefs = this.prefs();
    this.save({
      ...prefs,
      subscribed: toggle(prefs.subscribed, provider, value && PAID.has(provider)),
      hidden: value ? toggle(prefs.hidden, provider, false) : prefs.hidden,
    });
  }
  /** Hiding a service also ends its subscription preference. */
  setHidden(provider: string, value: boolean): void {
    const prefs = this.prefs();
    this.save({
      ...prefs,
      hidden: toggle(prefs.hidden, provider, value),
      subscribed: value ? toggle(prefs.subscribed, provider, false) : prefs.subscribed,
    });
  }
  setShowAll(value: boolean): void {
    this.save({ ...this.prefs(), showAll: value });
  }

  private load(): void {
    try {
      const data = JSON.parse(
        localStorage.getItem(KEY + accountScopeSuffix()) ?? 'null',
      ) as Partial<ServicePreferences> | null;
      const list = (value: unknown) =>
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string')
          : [];
      const hidden = list(data?.hidden);
      this.prefs.set({
        hidden,
        // A hand-edited or older record must not leave a service both ways.
        subscribed: list(data?.subscribed).filter((id) => PAID.has(id) && !hidden.includes(id)),
        showAll: data?.showAll === true,
      });
    } catch {
      this.prefs.set(DEFAULT_PREFERENCES);
    }
  }
  private save(prefs: ServicePreferences): void {
    this.prefs.set(prefs);
    try {
      localStorage.setItem(KEY + accountScopeSuffix(), JSON.stringify(prefs));
    } catch {
      /* Preferences still apply for this tab. */
    }
  }
}

function toggle(list: readonly string[], item: string, on: boolean): string[] {
  const rest = list.filter((value) => value !== item);
  return on ? [...rest, item] : rest;
}
