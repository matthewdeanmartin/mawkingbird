import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_LOCAL_AI } from '../../platform/http/platform-http';
import { OpenRouterChat } from '../openrouter/openrouter-chat';
import { OpenRouterSession } from '../openrouter/openrouter-session';
import { LocalAi } from './local-ai';

function transport(reply: { status: number; body: string }) {
  return {
    status: vi.fn().mockResolvedValue({ endpoint: 'http://127.0.0.1:11434' }),
    setEndpoint: vi.fn(async (endpoint: string | null) => ({ endpoint })),
    request: vi.fn().mockResolvedValue(reply),
  };
}

const ok = (content: string) => ({
  status: 200,
  body: JSON.stringify({ choices: [{ message: { content } }] }),
});

describe('LocalAi (parity item 1)', () => {
  let httpMock: HttpTestingController;

  function setUp(reply: { status: number; body: string }) {
    const native = transport(reply);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_LOCAL_AI, useValue: native },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return { native, localAi: TestBed.inject(LocalAi) };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('is unavailable on the web, where the token is null', () => {
    TestBed.configureTestingModule({});
    const localAi = TestBed.inject(LocalAi);
    expect(localAi.available).toBe(false);
    expect(localAi.active()).toBe(false);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('lists the server models and becomes the AI provider once a model is chosen', async () => {
    const { native, localAi } = setUp({
      status: 200,
      body: JSON.stringify({ data: [{ id: 'llama3.2' }, { id: 'llava' }] }),
    });
    await Promise.resolve();
    expect(localAi.endpoint()).toBe('http://127.0.0.1:11434');
    expect(await localAi.listModels()).toEqual(['llama3.2', 'llava']);
    expect(native.request).toHaveBeenCalledWith({ path: '/v1/models', method: 'GET' });
    expect(localAi.active()).toBe(false);
    localAi.setModel('llama3.2');
    expect(localAi.active()).toBe(true);
    expect(TestBed.inject(OpenRouterSession).ready()).toBe(true);
    expect(TestBed.inject(OpenRouterSession).connected()).toBe(false);
  });

  it('routes completions to the local server, with no cost and no OpenRouter request', async () => {
    const { native, localAi } = setUp(ok('Bonjour'));
    await Promise.resolve();
    localAi.setModel('llama3.2');
    const result = await TestBed.inject(OpenRouterChat).completeWithCost({
      prompt: 'Translate hi',
    });
    expect(result).toEqual({ text: 'Bonjour', costUsd: null });
    const body = JSON.parse(native.request.mock.calls[0][0].body as string);
    expect(body.model).toBe('llama3.2');
    expect(body.usage).toBeUndefined();
    httpMock.expectNone(() => true);
  });

  it('shows the model’s own error as-is and never falls back to OpenRouter', async () => {
    const { localAi } = setUp({
      status: 500,
      body: JSON.stringify({ error: { message: 'model does not support images' } }),
    });
    await Promise.resolve();
    localAi.setModel('llama3.2');
    await expect(
      TestBed.inject(OpenRouterChat).describeImage('data:image/png;base64,AA==', 'en'),
    ).rejects.toThrow('model does not support images');
    httpMock.expectNone(() => true);
  });

  it('passes the native host’s message through when the server is not running', async () => {
    const { native, localAi } = setUp(ok(''));
    native.request.mockRejectedValue(new Error('The local AI server isn’t running.'));
    await Promise.resolve();
    await expect(localAi.listModels()).rejects.toThrow('isn’t running');
  });

  it('remembers the model and the switch, and can be turned off', async () => {
    const { localAi } = setUp(ok(''));
    await Promise.resolve();
    localAi.setModel('mistral');
    localAi.setEnabled(false);
    expect(localAi.active()).toBe(false);
    expect(JSON.parse(localStorage.getItem('mockingbird_local_ai')!)).toEqual({
      model: 'mistral',
      enabled: false,
    });
  });
});
