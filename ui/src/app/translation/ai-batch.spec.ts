import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterChat } from '../connections/openrouter/openrouter-chat';
import { TranslationUsage } from './translation-usage';
import { AiBatchTranslator, BATCH_MAX_ITEMS, batchPrompt, parseBatchReply } from './ai-batch';

describe('AiBatchTranslator', () => {
  let complete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    complete = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: OpenRouterChat, useValue: { completeWithCost: complete } },
        { provide: TranslationUsage, useValue: { record: vi.fn() } },
      ],
    });
  });
  afterEach(() => vi.useRealTimers());

  it('sends posts that arrive together as one request and shares the cost', async () => {
    complete.mockResolvedValue({ text: '["Hello","Good night"]', costUsd: 0.002 });
    const batch = TestBed.inject(AiBatchTranslator);
    const a = batch.translate('こんにちは', 'en');
    const b = batch.translate('おやすみ', 'en');
    await vi.advanceTimersByTimeAsync(600);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].raw).toBe(true);
    expect(complete.mock.calls[0][0].prompt).toContain('["こんにちは","おやすみ"]');
    expect(await a).toEqual({ text: 'Hello', costUsd: 0.001 });
    expect(await b).toEqual({ text: 'Good night', costUsd: 0.001 });
  });

  it('sends at once when the batch is full', async () => {
    complete.mockResolvedValue({
      text: JSON.stringify(Array.from({ length: BATCH_MAX_ITEMS }, (_, i) => `t${i}`)),
      costUsd: null,
    });
    const batch = TestBed.inject(AiBatchTranslator);
    const all = Array.from({ length: BATCH_MAX_ITEMS }, (_, i) => batch.translate(`s${i}`, 'en'));
    await vi.advanceTimersByTimeAsync(0);
    expect(complete).toHaveBeenCalledTimes(1);
    expect((await all[3]).text).toBe('t3');
  });

  it('fails every item of a reply that does not match', async () => {
    complete.mockResolvedValue({ text: '["only one"]', costUsd: 0.001 });
    const batch = TestBed.inject(AiBatchTranslator);
    const a = batch.translate('a', 'en').catch((e: unknown) => e);
    const b = batch.translate('b', 'en').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(600);
    expect(await a).toBeInstanceOf(Error);
    expect(await b).toBeInstanceOf(Error);
  });

  it('keeps separate queues per target language', async () => {
    complete.mockResolvedValue({ text: '["x"]', costUsd: null });
    const batch = TestBed.inject(AiBatchTranslator);
    void batch.translate('a', 'en');
    void batch.translate('b', 'de');
    await vi.advanceTimersByTimeAsync(600);
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

describe('batch prompt and reply', () => {
  it('asks for a JSON array of exactly N items and explains Japanese net slang', () => {
    const prompt = batchPrompt(['草', 'ねむい'], 'English');
    expect(prompt).toContain('exactly 2 items');
    expect(prompt).toContain('草');
    expect(prompt).toContain('lol');
  });

  it('accepts a fenced reply and rejects a wrong count or non-strings', () => {
    expect(parseBatchReply('```json\n["a","b"]\n```', 2)).toEqual(['a', 'b']);
    expect(() => parseBatchReply('["a"]', 2)).toThrow();
    expect(() => parseBatchReply('[1, 2]', 2)).toThrow();
    expect(() => parseBatchReply('no json here', 1)).toThrow();
  });
});
