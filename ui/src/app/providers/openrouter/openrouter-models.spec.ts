import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  MODEL_SEARCH_LIMIT,
  OpenRouterModels,
  perMillionTokens,
} from './openrouter-models';

describe('OpenRouterModels', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 'google/gemma-4-31b-it',
              name: 'Gemma 4 31B',
              context_length: 262144,
              pricing: { prompt: '0.0000001', completion: '0.00000034' },
            },
          ],
        }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function models(): OpenRouterModels {
    return TestBed.inject(OpenRouterModels);
  }

  function requestedUrls(): URL[] {
    return fetchMock.mock.calls.map((call) => new URL(call[0] as string));
  }

  /**
   * The design rule as an executable check: OpenRouter lists ~500 models and we
   * never ask for them. If a future change adds a browse-everything path, this
   * fails.
   */
  it('never issues an unfiltered request, whatever it is asked for', async () => {
    const svc = models();
    await svc.search('gemma');
    await svc.search('');
    await svc.search('   ');
    await svc.search('haiku', { structuredOnly: false });

    expect(requestedUrls().length).toBeGreaterThan(0);
    for (const url of requestedUrls()) {
      expect(url.searchParams.get('q')).toBeTruthy();
      expect(Number(url.searchParams.get('limit'))).toBeLessThanOrEqual(MODEL_SEARCH_LIMIT);
    }
  });

  it('filters to structured-output models by default', async () => {
    await models().search('gemma');
    expect(requestedUrls()[0].searchParams.get('supported_parameters')).toBe('structured_outputs');
  });

  it('drops the structured filter when asked, to surface the free variants', async () => {
    await models().search('gemma', { structuredOnly: false });
    expect(requestedUrls()[0].searchParams.get('supported_parameters')).toBeNull();
  });

  it('treats an empty query as "show the default", not "show everything"', async () => {
    await models().search('');
    expect(requestedUrls()[0].searchParams.get('q')).toBe(DEFAULT_MODEL_ID);
  });

  it('returns a trimmed model shape with parsed prices', async () => {
    const [model] = await models().search('gemma');
    expect(model).toEqual({
      id: 'google/gemma-4-31b-it',
      name: 'Gemma 4 31B',
      contextLength: 262144,
      promptPrice: 1e-7,
      completionPrice: 3.4e-7,
    });
  });

  it('caches per query and filter, but not across them', async () => {
    const svc = models();
    await svc.search('gemma');
    await svc.search('gemma');
    expect(fetchMock).toHaveBeenCalledOnce();

    await svc.search('gemma', { structuredOnly: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports the API error message when the list cannot be read', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'upstream exploded' } }),
    });

    await expect(models().search('gemma')).rejects.toThrow('upstream exploded');
  });

  it('tolerates entries missing a name or price', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ id: 'a/b' }, { name: 'no id' }] }),
    });

    expect(await models().search('x')).toEqual([
      { id: 'a/b', name: 'a/b', contextLength: null, promptPrice: null, completionPrice: null },
    ]);
  });
});

describe('perMillionTokens', () => {
  it('scales per-token prices to something a human can compare', () => {
    expect(perMillionTokens(1e-7)).toBe('$0.10 / M tokens');
    expect(perMillionTokens(3.4e-7)).toBe('$0.34 / M tokens');
  });

  it('keeps four decimals for prices that would round to zero', () => {
    expect(perMillionTokens(5e-12)).toBe('$0.0000 / M tokens');
  });

  it('names free and unknown prices rather than printing $0.00', () => {
    expect(perMillionTokens(0)).toBe('free');
    expect(perMillionTokens(null)).toBeNull();
  });
});
