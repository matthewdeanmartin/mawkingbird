import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterChat } from './openrouter-chat';
import { OpenRouterSession } from './openrouter-session';
import { OpenRouterModelChoice } from './openrouter-model-choice';

describe('OpenRouterChat', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let disconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    disconnect = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: OpenRouterSession, useValue: { apiKey: () => 'sk-or-v1-test', disconnect } },
        { provide: OpenRouterModelChoice, useValue: { modelId: () => 'google/gemma-4-31b-it' } },
      ],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function chat(): OpenRouterChat {
    return TestBed.inject(OpenRouterChat);
  }

  function reply(content: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    } as Response;
  }

  function errorReply(status: number, message = 'nope'): Response {
    return {
      ok: false,
      status,
      json: () => Promise.resolve({ error: { message } }),
    } as Response;
  }

  const ask = { prompt: 'Suggest things', schemaName: 'search_queries', max: 5 };

  it('sends the chosen model, the prompt, and a strict schema', async () => {
    fetchMock.mockResolvedValue(reply({ suggestions: ['a', 'b'] }));

    expect((await chat().suggest(ask)).suggestions).toEqual(['a', 'b']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-or-v1-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('google/gemma-4-31b-it');
    expect(body.messages[0].content).toBe('Suggest things');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.max_tokens).toBeLessThanOrEqual(1000);
  });

  it('retries once without the schema when the reply is unparseable', async () => {
    fetchMock
      .mockResolvedValueOnce(reply('I cannot help with that.'))
      .mockResolvedValueOnce(reply({ suggestions: ['a'] }));

    expect((await chat().suggest(ask)).suggestions).toEqual(['a']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(second.response_format).toBeUndefined();
    expect(second.messages[0].content).toContain('Reply with JSON only');
  });

  it('retries when the provider rejects the schema outright', async () => {
    fetchMock
      .mockResolvedValueOnce(errorReply(400, 'response_format is not supported'))
      .mockResolvedValueOnce(reply({ suggestions: ['a'] }));

    expect((await chat().suggest(ask)).suggestions).toEqual(['a']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry rather than looping', async () => {
    fetchMock.mockResolvedValue(reply('still prose'));

    await expect(chat().suggest(ask)).rejects.toThrow(/structured output/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not waste a retry on a bill that will not change', async () => {
    fetchMock.mockResolvedValue(errorReply(402, 'insufficient credits'));

    await expect(chat().suggest(ask)).rejects.toThrow(/credits have run out/i);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('disconnects and says so when the key has been revoked', async () => {
    fetchMock.mockResolvedValue(errorReply(401));

    await expect(chat().suggest(ask)).rejects.toThrow(/no longer recognises this key/i);
    expect(disconnect).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('explains rate limiting in words a user can act on', async () => {
    fetchMock.mockResolvedValue(errorReply(429));
    await expect(chat().suggest(ask)).rejects.toThrow(/rate-limiting/i);
  });

  it('reports a network failure plainly', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(chat().suggest(ask)).rejects.toThrow("Couldn't reach OpenRouter.");
  });

  it('refuses to call anything when not connected', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: OpenRouterSession, useValue: { apiKey: () => null, disconnect: vi.fn() } },
        { provide: OpenRouterModelChoice, useValue: { modelId: () => 'x' } },
      ],
    });

    await expect(TestBed.inject(OpenRouterChat).suggest(ask)).rejects.toThrow(/Connect OpenRouter/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
