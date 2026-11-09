import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiTranslate } from '../ai-translate';
import { ClientPrefs } from '../client-prefs';
import { Status } from '../models';
import { FeedLanguageFilter } from '../trend-language-filter';
import { TranslationUsage } from '../translation-usage';
import { BrowserTranslator } from './browser-translator';
import { FreeTranslators, TranslatorRefusal } from './free-translators';
import { TranslationPairCatalog } from './pair-catalog';
import { TranslationConnectors } from './translation-connectors';
import { RouteRequest, TranslationRouter } from './translation-router';

const status = (extra: Partial<Status> = {}) =>
  ({
    id: '42',
    content: '<p>Guten Morgen, wie geht es euch allen heute?</p>',
    spoiler_text: '',
    language: 'de',
    account: { acct: 'a' },
    reblog: null,
    ...extra,
  }) as unknown as Status;

describe('TranslationRouter', () => {
  let http: HttpTestingController;
  let router: TranslationRouter;
  let detected: { language: string | null; candidates: string[] };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(TranslationRouter);
    detected = { language: 'de', candidates: ['de'] };
    vi.spyOn(TestBed.inject(FeedLanguageFilter), 'languageAssessment').mockImplementation(
      () => detected as never,
    );
    vi.spyOn(TestBed.inject(AiTranslate), 'targetLanguage').mockReturnValue('en');
    // No browser translator unless a test installs one.
    vi.spyOn(TestBed.inject(BrowserTranslator), 'supported').mockReturnValue(false);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  const request = (extra: Partial<RouteRequest> = {}): RouteRequest => ({
    status: status(),
    mode: 'manual',
    serverCanTranslate: true,
    aiAvailable: false,
    ...extra,
  });

  const pairs = (answer: Awaited<ReturnType<TranslationPairCatalog['serverPair']>>) =>
    vi.spyOn(TestBed.inject(TranslationPairCatalog), 'serverPair').mockResolvedValue(answer);

  it('uses the server first when it lists the pair, sending the matched target', async () => {
    pairs({ ok: true, lang: 'en-GB' });
    const pending = router.translate(request());
    const req = await vi.waitFor(() => http.expectOne('/api/v1/statuses/42/translate'));
    expect(req.request.body).toEqual({ lang: 'en-GB' });
    req.flush({ content: '<p>Good morning</p>', provider: 'DeepL' });
    await expect(pending).resolves.toMatchObject({ kind: 'server', source: 'de', target: 'en' });
  });

  it('skips an unlisted pair without a request, then falls through to the next engine', async () => {
    pairs({ ok: false, reason: 'unsupported' });
    TestBed.inject(TranslationConnectors).setMyMemoryEnabled(true);
    const my = vi
      .spyOn(TestBed.inject(FreeTranslators), 'myMemory')
      .mockResolvedValue('Good morning');
    const outcome = await router.translate(request());
    http.expectNone('/api/v1/statuses/42/translate');
    expect(my).toHaveBeenCalledWith(expect.stringContaining('Guten Morgen'), 'de', 'en', '');
    expect(outcome).toMatchObject({ kind: 'text', engine: 'mymemory', text: 'Good morning' });
  });

  it('does not ask the server for a mis-tagged post: it would translate from the wrong tag', async () => {
    const server = pairs({ ok: true, lang: 'en' });
    const outcome = await router.translate(request({ status: status({ language: 'en' }) }));
    expect(server).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      kind: 'failed',
      source: 'de',
      attempts: expect.arrayContaining([{ engine: 'mastodon', reason: 'wrong-tag' }]),
    });
  });

  it('remembers a 403 for the rest of the session', async () => {
    pairs({ ok: null });
    const pending = router.translate(request());
    (await vi.waitFor(() => http.expectOne('/api/v1/statuses/42/translate'))).flush('', {
      status: 403,
      statusText: 'Forbidden',
    });
    await expect(pending).resolves.toMatchObject({ kind: 'failed' });
    expect(TestBed.inject(TranslationPairCatalog).isRefused('mastodon', 'de', 'en')).toBe(true);
  });

  it('asks for the source when the label says English and detection cannot tell', async () => {
    detected = { language: null, candidates: ['nl', 'de'] };
    const outcome = await router.translate(request({ status: status({ language: 'en' }) }));
    expect(outcome).toEqual({ kind: 'ask', candidates: ['nl', 'de'], target: 'en' });
  });

  it('never asks in automatic mode', async () => {
    detected = { language: null, candidates: ['nl'] };
    const outcome = await router.translate(
      request({ mode: 'auto', status: status({ language: 'en' }) }),
    );
    expect(outcome.kind).toBe('failed');
  });

  it('translates from a picked source and skips the server unless it matches the tag', async () => {
    const server = pairs({ ok: true, lang: 'en' });
    TestBed.inject(TranslationConnectors).setApertiumEnabled(true);
    vi.spyOn(TestBed.inject(TranslationPairCatalog), 'apertiumPair').mockResolvedValue('nld|eng');
    vi.spyOn(TestBed.inject(FreeTranslators), 'apertium').mockResolvedValue('Hello');
    const outcome = await router.translate(
      request({ status: status({ language: 'en' }), source: 'nl' }),
    );
    expect(server).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ kind: 'text', engine: 'apertium', source: 'nl' });
  });

  it('reports a post already in the reader’s language', async () => {
    detected = { language: 'en', candidates: ['en'] };
    const outcome = await router.translate(request({ status: status({ language: 'en' }) }));
    expect(outcome).toEqual({ kind: 'same', language: 'en' });
  });

  it('uses the browser translator only when its model is ready in automatic mode', async () => {
    pairs({ ok: false, reason: 'no-provider' });
    const browser = TestBed.inject(BrowserTranslator);
    vi.spyOn(browser, 'supported').mockReturnValue(true);
    vi.spyOn(browser, 'availability').mockResolvedValue('downloadable');
    const translate = vi.spyOn(browser, 'translate').mockResolvedValue('Good morning');

    const auto = await router.translate(request({ mode: 'auto' }));
    expect(translate).not.toHaveBeenCalled();
    expect(auto).toMatchObject({
      kind: 'failed',
      attempts: expect.arrayContaining([{ engine: 'browser', reason: 'needs-download' }]),
    });

    const manual = await router.translate(request());
    expect(manual).toMatchObject({ kind: 'text', engine: 'browser' });
  });

  it('honours the browser translator switch', async () => {
    pairs({ ok: false, reason: 'no-provider' });
    vi.spyOn(TestBed.inject(BrowserTranslator), 'supported').mockReturnValue(true);
    TestBed.inject(ClientPrefs).setBrowserTranslator(false);
    const outcome = await router.translate(request());
    expect(outcome).toMatchObject({
      attempts: expect.arrayContaining([{ engine: 'browser', reason: 'off' }]),
    });
  });

  it('never spends AI in automatic mode unless the reader allowed it', async () => {
    pairs({ ok: false, reason: 'no-provider' });
    const ai = vi.spyOn(TestBed.inject(AiTranslate), 'translateTextWithCost');
    const outcome = await router.translate(request({ mode: 'auto', aiAvailable: true }));
    expect(ai).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      attempts: expect.arrayContaining([{ engine: 'openrouter', reason: 'auto-excluded' }]),
    });
  });

  it('uses AI last when connected, for a manual press', async () => {
    pairs({ ok: false, reason: 'no-provider' });
    vi.spyOn(TestBed.inject(AiTranslate), 'translateTextWithCost').mockResolvedValue({
      text: 'Good morning',
      model: 'm',
      target: 'English',
    });
    const outcome = await router.translate(request({ aiAvailable: true }));
    expect(outcome).toMatchObject({ kind: 'text', engine: 'openrouter' });
  });

  it('counts MyMemory in characters, and stops for the day when its quota runs out', async () => {
    pairs({ ok: false, reason: 'no-provider' });
    TestBed.inject(TranslationConnectors).setMyMemoryEnabled(true);
    const usage = TestBed.inject(TranslationUsage);
    vi.spyOn(TestBed.inject(FreeTranslators), 'myMemory').mockRejectedValue(
      new TranslatorRefusal('quota', 'used up'),
    );
    const outcome = await router.translate(request());
    expect(outcome).toMatchObject({
      attempts: expect.arrayContaining([{ engine: 'mymemory', reason: 'budget' }]),
    });
    expect(usage.canSpend('mymemory', 1)).toBe(false);
  });

  it('skips an engine whose budget is used up, without calling it', async () => {
    pairs({ ok: true, lang: 'en' });
    vi.spyOn(TestBed.inject(TranslationUsage), 'canSpend').mockReturnValue(false);
    const outcome = await router.translate(request());
    http.expectNone('/api/v1/statuses/42/translate');
    expect(outcome).toMatchObject({
      attempts: expect.arrayContaining([{ engine: 'mastodon', reason: 'budget' }]),
    });
  });
});
