import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyStorageKey } from '../platform/storage/storage-registry';
import { matchServerTarget, PAIR_CACHE_KEY, TranslationPairCatalog } from './pair-catalog';

const LIST = '/api/v1/instance/translation_languages';

describe('matchServerTarget', () => {
  const list = { de: ['en', 'fr'], af: ['en-GB', 'pt'], ja: ['en-US'] };

  it('prefers the exact target, then the bare one, then a regional variant', () => {
    expect(matchServerTarget(list, 'de', 'en')).toEqual({ ok: true, lang: 'en' });
    expect(matchServerTarget(list, 'af', 'en')).toEqual({ ok: true, lang: 'en-GB' });
    expect(matchServerTarget(list, 'ja', 'en-US')).toEqual({ ok: true, lang: 'en-US' });
  });

  it('refuses pairs the server does not list, and says when it lists nothing at all', () => {
    expect(matchServerTarget(list, 'de', 'ja')).toEqual({ ok: false, reason: 'unsupported' });
    expect(matchServerTarget(list, 'eo', 'en')).toEqual({ ok: false, reason: 'unsupported' });
    expect(matchServerTarget({}, 'de', 'en')).toEqual({ ok: false, reason: 'no-provider' });
  });
});

describe('TranslationPairCatalog', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('asks the server once and answers later questions from the cache', async () => {
    const catalog = TestBed.inject(TranslationPairCatalog);
    const first = catalog.serverPair('de', 'en');
    (await vi.waitFor(() => http.expectOne(LIST))).flush({ de: ['en'] });
    await expect(first).resolves.toEqual({ ok: true, lang: 'en' });
    await expect(catalog.serverPair('eo', 'en')).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
    });
    http.expectNone(LIST);
  });

  it('allows one attempt when the server has no list (old server), and does not ask again', async () => {
    const catalog = TestBed.inject(TranslationPairCatalog);
    const pending = catalog.serverPair('de', 'en');
    (await vi.waitFor(() => http.expectOne(LIST))).flush('', { status: 404, statusText: 'Nope' });
    await expect(pending).resolves.toEqual({ ok: null });
    await expect(catalog.serverPair('de', 'en')).resolves.toEqual({ ok: null });
    http.expectNone(LIST);
  });

  it('lets a refusal seen this session override the list', async () => {
    const catalog = TestBed.inject(TranslationPairCatalog);
    catalog.markRefused('mastodon', 'de', 'en');
    await expect(catalog.serverPair('de', 'en')).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
    });
    http.expectNone(LIST);
  });

  it('refetches the server list after a day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const catalog = TestBed.inject(TranslationPairCatalog);
    const first = catalog.serverPair('de', 'en');
    (await vi.waitFor(() => http.expectOne(LIST))).flush({ de: ['en'] });
    await first;
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    const later = catalog.serverPair('de', 'en');
    (await vi.waitFor(() => http.expectOne(LIST))).flush({ de: ['fr'] });
    await expect(later).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });

  it('checks Apertium pairs in three-letter codes from its published list', async () => {
    const catalog = TestBed.inject(TranslationPairCatalog);
    const pending = catalog.apertiumPair('es', 'en');
    (await vi.waitFor(() => http.expectOne('https://apertium.org/apy/listPairs'))).flush({
      responseData: [{ sourceLanguage: 'spa', targetLanguage: 'eng' }],
    });
    await expect(pending).resolves.toBe('spa|eng');
    await expect(catalog.apertiumPair('de', 'en')).resolves.toBeNull();
    await expect(catalog.apertiumPair('xx', 'en')).resolves.toBeNull();
  });

  it('is cache, never exported', () => {
    expect(classifyStorageKey(PAIR_CACHE_KEY)?.sensitivity).toBe('cache');
  });
});
