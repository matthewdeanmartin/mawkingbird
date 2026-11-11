import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanAltText, OpenRouterChat } from './openrouter-chat';
import { OpenRouterModelChoice } from './openrouter-model-choice';
import { OpenRouterSession } from './openrouter-session';

describe('OpenRouterChat.describeImage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OpenRouterSession,
          useValue: { apiKey: () => 'sk-or-v1-test', disconnect: vi.fn() },
        },
        { provide: OpenRouterModelChoice, useValue: { modelId: () => 'google/gemma-4-31b-it' } },
      ],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    TestBed.resetTestingModule();
  });

  const ok = (content: unknown) =>
    ({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    }) as Response;

  it('sends the image beside the prompt and tidies the reply', async () => {
    fetchMock.mockResolvedValue(ok('Alt text: "A grey heron on a **wooden** post."'));
    const text = await TestBed.inject(OpenRouterChat).describeImage(
      'https://cdn.example/heron.jpg',
      'en',
    );
    expect(text).toBe('A grey heron on a wooden post.');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('google/gemma-4-31b-it');
    expect(body.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://cdn.example/heron.jpg' },
    });
    expect(body.messages[0].content[0].text).toContain('"en"');
  });

  it('explains when the chosen model cannot read images', async () => {
    const failure = {
      ok: false,
      status: 404,
      clone: () => ({ text: () => Promise.resolve('No endpoints found that support image input') }),
      json: () => Promise.resolve({ error: { message: 'No endpoints found' } }),
    } as unknown as Response;
    fetchMock.mockResolvedValue(failure);
    await expect(
      TestBed.inject(OpenRouterChat).describeImage('data:image/jpeg;base64,AAAA', 'en'),
    ).rejects.toThrow("can't read images");
  });

  it('caps alt text at 1,500 characters', () => {
    expect(cleanAltText('x'.repeat(2000))).toHaveLength(1500);
    expect(cleanAltText('  “Two kites”  ')).toBe('Two kites');
  });
});
