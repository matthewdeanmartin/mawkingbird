import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativeIntelligenceInterceptor } from './native-intelligence-http';
import { FreeTranslators } from '../../translation/free-translators';
import { PLATFORM_CONNECTORS, PLATFORM_INTELLIGENCE } from './platform-http';
import { OpenRouterSession } from '../../connections/openrouter/openrouter-session';
import { OpenRouterChat } from '../../connections/openrouter/openrouter-chat';
import { OpenRouterCredits } from '../../connections/openrouter/openrouter-credits';
import { OpenRouterModels } from '../../connections/openrouter/openrouter-models';
import { VaultBridge } from '../../connections/vault/vault-bridge';
const invoke = vi.fn();
const connectors = { connect: vi.fn(), request: vi.fn(), forget: vi.fn() };
const native = { login: vi.fn(), request: vi.fn() };
const vault = {
  readThrough: vi.fn(),
  writeThrough: vi.fn(),
  removeThrough: vi.fn(),
  verdictFor: vi.fn(),
};
const handle = 'native-connector:' + 'o'.repeat(43);
const response = (body: unknown, status = 200) => ({
  status,
  headers: {},
  body: JSON.stringify(body),
});
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Browser fetch must not run')));
  connectors.connect.mockResolvedValue(handle);
  connectors.forget.mockResolvedValue(undefined);
  native.login.mockResolvedValue(handle);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr(), withInterceptors([nativeIntelligenceInterceptor])),
      provideHttpClientTesting(),
      { provide: PLATFORM_CONNECTORS, useValue: connectors },
      { provide: PLATFORM_INTELLIGENCE, useValue: native },
      { provide: VaultBridge, useValue: vault },
    ],
  });
});
afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('uses native MyMemory transport while preserving UTF-8 chunking and quota refusal', async () => {
  invoke.mockResolvedValue(
    response({ responseStatus: 200, responseData: { translatedText: 'Hello' } }),
  );
  const service = TestBed.inject(FreeTranslators);
  expect(await service.myMemory('Bonjour', 'fr', 'en', 'person@example.com')).toBe('Hello');
  const [command, args] = invoke.mock.calls[0];
  expect(command).toBe('intelligence_public_request');
  const url = new URL(args.url);
  expect(url.searchParams.get('q')).toBe('Bonjour');
  expect(url.searchParams.get('de')).toBe('person@example.com');
  invoke.mockClear();
  await service.myMemory('界'.repeat(200), 'ja', 'en');
  expect(invoke).toHaveBeenCalledTimes(2);
  for (const [, args] of invoke.mock.calls)
    expect(
      new TextEncoder().encode(new URL(args.url).searchParams.get('q')!).length,
    ).toBeLessThanOrEqual(450);
  invoke.mockResolvedValue(response({ responseStatus: 429, quotaFinished: true }));
  await expect(service.myMemory('Bonjour', 'fr', 'en')).rejects.toMatchObject({ reason: 'quota' });
});
it('sends Apertium form data through Rust and preserves unsupported-pair errors', async () => {
  invoke.mockResolvedValue(
    response({ responseStatus: 200, responseData: { translatedText: 'Hello' } }),
  );
  const service = TestBed.inject(FreeTranslators);
  expect(await service.apertium('Hola & adiós', 'spa|eng')).toBe('Hello');
  const args = invoke.mock.calls[0][1];
  expect(args.method).toBe('POST');
  expect(new URLSearchParams(args.body).get('q')).toBe('Hola & adiós');
  invoke.mockResolvedValue(response({}, 400));
  await expect(service.apertium('Hola', 'spa|zzz')).rejects.toMatchObject({
    reason: 'unsupported',
  });
});
it('persists only OS references for pasted keys and browser OAuth, retaining state on failed deletion', async () => {
  const session = TestBed.inject(OpenRouterSession);
  await session.connectKey('secret-fixture');
  expect(connectors.connect).toHaveBeenCalledWith('openrouter', 'secret-fixture', undefined);
  expect(JSON.stringify(localStorage)).not.toContain('secret-fixture');
  expect(session.apiKey()).toBe(handle);
  expect(session.expiresAt()).toBeNull();
  await session.syncToVault();
  expect(vault.writeThrough).not.toHaveBeenCalled();
  connectors.forget.mockRejectedValueOnce(new Error('OS locked'));
  await expect(session.disconnect()).rejects.toThrow('OS locked');
  expect(session.connected()).toBe(true);
  await session.disconnect();
  expect(session.connected()).toBe(false);
  await session.connect();
  expect(native.login).toHaveBeenCalledOnce();
  expect(session.apiKey()).toBe(handle);
});
it('routes models, credits and costed completions through Rust without renderer keys', async () => {
  const session = TestBed.inject(OpenRouterSession);
  await session.connect();
  native.request.mockResolvedValue(response({ data: [] }));
  await TestBed.inject(OpenRouterModels).search('test');
  expect(native.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET' }));
  connectors.request
    .mockResolvedValueOnce(response({}, 403))
    .mockResolvedValueOnce(response({ data: { usage: 2, limit: 5, limit_remaining: 3 } }));
  expect(await TestBed.inject(OpenRouterCredits).load()).toEqual({
    kind: 'capped',
    remaining: 3,
    limit: 5,
  });
  connectors.request.mockResolvedValue(
    response({ choices: [{ message: { content: 'Hello' } }], usage: { cost: 0.001 } }),
  );
  expect(
    await TestBed.inject(OpenRouterChat).completeWithCost({ prompt: 'Translate', raw: true }),
  ).toEqual({ text: 'Hello', costUsd: 0.001 });
  expect(connectors.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      provider: 'openrouter',
      handle,
      method: 'POST',
      body: expect.objectContaining({ usage: { include: true } }),
    }),
  );
  expect(fetch).not.toHaveBeenCalled();
});
it('never automatically retries billable native completions or silently removes a rejected key', async () => {
  const session = TestBed.inject(OpenRouterSession);
  await session.connect();
  const chat = TestBed.inject(OpenRouterChat);
  connectors.request.mockResolvedValue(
    response({ choices: [{ message: { content: 'not JSON' } }] }),
  );
  await expect(chat.suggest({ prompt: 'test', schemaName: 'test', max: 5 })).rejects.toThrow();
  expect(connectors.request).toHaveBeenCalledTimes(1);
  connectors.request.mockResolvedValue(response({}, 401));
  await expect(chat.complete({ prompt: 'test' })).rejects.toThrow('Connect again');
  expect(connectors.forget).not.toHaveBeenCalled();
  expect(session.connected()).toBe(true);
});
