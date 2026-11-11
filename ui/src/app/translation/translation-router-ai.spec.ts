import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiTranslate } from './ai-translate';
import { ClientPrefs } from '../platform/storage/client-prefs';
import { Status } from '../platform/api/models';
import { FeedLanguageFilter } from '../language/trend-language-filter';
import { AiBatchTranslator } from './ai-batch';
import { AiBudget } from './ai-budget';
import { BrowserTranslator } from './browser-translator';
import { hasTranslatableText, RouteRequest, TranslationRouter } from './translation-router';

const post = (content: string, extra: Partial<Status> = {}) =>
  ({
    id: '42',
    content,
    spoiler_text: '',
    language: null,
    account: { acct: 'a' },
    reblog: null,
    media_attachments: [],
    poll: null,
    ...extra,
  }) as unknown as Status;

/** T2: AI translation under a dollar cap, batched when automatic. */
describe('TranslationRouter AI step', () => {
  let router: TranslationRouter;
  let single: ReturnType<typeof vi.spyOn>;
  let batched: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(TranslationRouter);
    vi.spyOn(TestBed.inject(FeedLanguageFilter), 'languageAssessment').mockReturnValue({
      language: 'ja',
      candidates: ['ja'],
    } as never);
    vi.spyOn(TestBed.inject(AiTranslate), 'targetLanguage').mockReturnValue('en');
    vi.spyOn(TestBed.inject(BrowserTranslator), 'supported').mockReturnValue(false);
    single = vi
      .spyOn(TestBed.inject(AiTranslate), 'translateTextWithCost')
      .mockResolvedValue({ text: 'Hello', model: 'm', target: 'English', costUsd: 0.01 });
    batched = vi
      .spyOn(TestBed.inject(AiBatchTranslator), 'translate')
      .mockResolvedValue({ text: 'Hello (batched)', costUsd: 0.002 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const request = (extra: Partial<RouteRequest> = {}): RouteRequest => ({
    status: post('<p>こんにちは</p>'),
    mode: 'manual',
    serverCanTranslate: false,
    aiAvailable: true,
    ...extra,
  });

  it('translates a pressed post alone and records its cost', async () => {
    const outcome = await router.translate(request());
    expect(outcome).toMatchObject({ kind: 'text', engine: 'openrouter', text: 'Hello' });
    expect(single).toHaveBeenCalled();
    expect(batched).not.toHaveBeenCalled();
    expect(TestBed.inject(AiBudget).spentTodayUsd()).toBeCloseTo(0.01);
  });

  it('batches automatic translations when the reader allowed AI for them', async () => {
    TestBed.inject(ClientPrefs).setAutoTranslateUsesAi(true);
    const outcome = await router.translate(request({ mode: 'auto' }));
    expect(outcome).toMatchObject({ text: 'Hello (batched)' });
    expect(single).not.toHaveBeenCalled();
    expect(TestBed.inject(AiBudget).spentTodayUsd()).toBeCloseTo(0.002);
  });

  it('refuses at the dollar cap and offers to raise it', async () => {
    const budget = TestBed.inject(AiBudget);
    budget.record(0.25);
    const outcome = await router.translate(request());
    expect(outcome).toMatchObject({ kind: 'failed' });
    expect((outcome as { attempts: { engine: string; reason: string }[] }).attempts).toContainEqual(
      {
        engine: 'openrouter',
        reason: 'budget',
      },
    );
    expect(single).not.toHaveBeenCalled();
    expect(budget.promptOpen()).toBe(true);
  });

  it('spends nothing on a post with no words', async () => {
    const outcome = await router.translate(request({ status: post('<p>🎉🎉 :blobcat:</p>') }));
    expect(outcome).toMatchObject({ kind: 'failed', attempts: [] });
    expect(single).not.toHaveBeenCalled();
  });
});

describe('hasTranslatableText', () => {
  it('is false for emoji, custom emoji, links, mentions and hashtags only', () => {
    expect(hasTranslatableText(post('<p>🎉✨</p>'))).toBe(false);
    expect(hasTranslatableText(post('<p>:blobcat: :party_parrot:</p>'))).toBe(false);
    expect(hasTranslatableText(post('<p>https://example.com/a</p>'))).toBe(false);
    expect(hasTranslatableText(post('<p>@ai@misskey.io #art</p>'))).toBe(false);
    expect(hasTranslatableText(post(''))).toBe(false);
  });

  it('is true for any word, including a single kanji', () => {
    expect(hasTranslatableText(post('<p>草</p>'))).toBe(true);
    expect(hasTranslatableText(post('<p>@ai ありがとう 🎉</p>'))).toBe(true);
    expect(hasTranslatableText(post('', { spoiler_text: 'ネタバレ' }))).toBe(true);
  });
});
