import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { PasteProviderRegistry } from './paste-provider-registry';
import { PasteSettings } from './paste-settings';
import { RentryProvider } from './rentry-provider';
import { TinyurlProvider } from './tinyurl-provider';
import { ShortenerPasteProvider } from './shortener-paste-provider';
import { GistProvider } from './gist-provider';

describe('Paste provider default', () => {
  const gistReady = signal(false);
  beforeEach(() => {
    localStorage.clear();
    gistReady.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: RentryProvider, useValue: { id: 'rentry' } },
        { provide: TinyurlProvider, useValue: { id: 'tinyurl' } },
        { provide: ShortenerPasteProvider, useValue: { id: 'shortener', available: () => false } },
        { provide: GistProvider, useValue: { id: 'gist', available: gistReady } },
      ],
    });
  });
  afterEach(() => localStorage.clear());

  it('uses the saved service for new compositions', () => {
    TestBed.inject(PasteSettings).select('tinyurl');
    expect(TestBed.inject(PasteProviderRegistry).default.id).toBe('tinyurl');
  });

  it('falls back during disconnection and restores the preference when reconnected', () => {
    TestBed.inject(PasteSettings).select('gist');
    const registry = TestBed.inject(PasteProviderRegistry);
    expect(registry.default.id).toBe('rentry');
    expect(registry.get('gist')?.id).toBe('gist');
    gistReady.set(true);
    expect(registry.default.id).toBe('gist');
    gistReady.set(false);
    expect(registry.default.id).toBe('rentry');
    expect(TestBed.inject(PasteSettings).selected()).toBe('gist');
  });
});
