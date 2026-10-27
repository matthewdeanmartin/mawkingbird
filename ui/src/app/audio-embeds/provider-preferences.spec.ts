import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { Server } from '../server';
import {
  arrangeSources,
  DEFAULT_PREFERENCES,
  ProviderPreferences,
  ServicePreferences,
} from './provider-preferences';
import { ExternalMedia } from './providers';

const source = (provider: string) => ({ key: provider, provider }) as ExternalMedia;
const arrange = (providers: string[], prefs: Partial<ServicePreferences>) =>
  arrangeSources(providers.map(source), { ...DEFAULT_PREFERENCES, ...prefs }).map(
    (item) => item.provider,
  );

describe('audio service preferences', () => {
  it('offers everything in post order when nothing is set', () => {
    expect(arrange(['spotify', 'apple-music', 'bandcamp'], {})).toEqual([
      'spotify',
      'apple-music',
      'bandcamp',
    ]);
  });

  it('puts subscribed services first and drops unsubscribed paid alternatives', () => {
    expect(
      arrange(['spotify', 'tidal', 'apple-music', 'soundcloud'], { subscribed: ['apple-music'] }),
    ).toEqual(['apple-music', 'soundcloud']);
  });

  it('drops unsubscribed paid services when a free service can play the post', () => {
    expect(arrange(['spotify', 'bandcamp'], { subscribed: ['apple-music'] })).toEqual(['bandcamp']);
  });

  it('keeps unsubscribed paid services when they are all the post offers', () => {
    expect(arrange(['spotify', 'deezer'], { subscribed: ['apple-music'] })).toEqual([
      'spotify',
      'deezer',
    ]);
  });

  it('never shows hidden services, even as the only option or with Show all', () => {
    expect(arrange(['spotify'], { hidden: ['spotify'] })).toEqual([]);
    expect(
      arrange(['spotify', 'apple-music', 'tidal'], {
        subscribed: ['apple-music'],
        hidden: ['tidal'],
        showAll: true,
      }),
    ).toEqual(['apple-music', 'spotify']);
  });

  it('leaves video and unknown sources alone', () => {
    expect(arrange(['youtube', 'spotify', 'podbean'], { subscribed: ['apple-music'] })).toEqual([
      'youtube',
      'podbean',
    ]);
  });

  describe('stored choices', () => {
    let prefs: ProviderPreferences;
    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [
          { provide: Auth, useValue: { kind: signal('mastodon'), token: signal('t') } },
          { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
        ],
      });
      prefs = TestBed.inject(ProviderPreferences);
      TestBed.tick();
    });

    it('keeps subscribing and hiding mutually exclusive', () => {
      prefs.setSubscribed('spotify', true);
      expect(prefs.prefs().subscribed).toEqual(['spotify']);
      prefs.setHidden('spotify', true);
      expect(prefs.prefs()).toMatchObject({ subscribed: [], hidden: ['spotify'] });
      prefs.setSubscribed('spotify', true);
      expect(prefs.prefs()).toMatchObject({ subscribed: ['spotify'], hidden: [] });
      // Only paid services can be subscribed to.
      prefs.setSubscribed('bandcamp', true);
      expect(prefs.prefs().subscribed).toEqual(['spotify']);
    });

    it('repairs a stored record that names a service both ways', () => {
      // No stored token: the unscoped key.
      localStorage.setItem(
        'mockingbird_audio_services',
        JSON.stringify({ subscribed: ['spotify', 'tidal'], hidden: ['spotify'], showAll: 'yes' }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: Auth, useValue: { kind: signal('mastodon'), token: signal('t') } },
          { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
        ],
      });
      const fresh = TestBed.inject(ProviderPreferences);
      TestBed.tick();
      expect(fresh.prefs()).toEqual({ subscribed: ['tidal'], hidden: ['spotify'], showAll: false });
    });
  });
});
