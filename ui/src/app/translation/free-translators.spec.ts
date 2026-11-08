import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chunkText,
  FreeTranslators,
  MYMEMORY_API,
  MYMEMORY_CHUNK_BYTES,
  TranslatorRefusal,
} from './free-translators';

const bytes = (text: string) => new TextEncoder().encode(text).length;

describe('chunkText', () => {
  it('keeps every character and never exceeds the byte limit', () => {
    const text = `${'Satz eins ist hier. '.repeat(40)}\n\n${'Ünïcødé wörds '.repeat(60)}${'x'.repeat(900)}`;
    const pieces = chunkText(text);
    expect(pieces.join('')).toBe(text);
    for (const piece of pieces) expect(bytes(piece)).toBeLessThanOrEqual(MYMEMORY_CHUNK_BYTES);
  });

  it('sends a short text as one piece', () => {
    expect(chunkText('Hallo Welt')).toEqual(['Hallo Welt']);
  });

  it('keeps text that starts with punctuation', () => {
    expect(chunkText('...und dann? Nichts.').join('')).toBe('...und dann? Nichts.');
  });
});

describe('FreeTranslators', () => {
  let http: HttpTestingController;
  let free: FreeTranslators;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    free = TestBed.inject(FreeTranslators);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  const nextMyMemory = () => vi.waitFor(() => http.expectOne((r) => r.url === MYMEMORY_API));

  it('MyMemory: sends the pair, adds the email only when given, and returns the text', async () => {
    const pending = free.myMemory('Hallo Welt', 'de', 'en');
    const req = await nextMyMemory();
    expect(req.request.params.get('langpair')).toBe('de|en');
    expect(req.request.params.has('de')).toBe(false);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ responseData: { translatedText: 'Hello World' }, responseStatus: 200 });
    await expect(pending).resolves.toBe('Hello World');

    const withEmail = free.myMemory('Hallo', 'de', 'en', 'me@example.org');
    const second = await nextMyMemory();
    expect(second.request.params.get('de')).toBe('me@example.org');
    second.flush({ responseData: { translatedText: 'Hello' }, responseStatus: 200 });
    await withEmail;
  });

  it('MyMemory: an error inside HTTP 200 is a refusal, not a translation', async () => {
    // Verified reply for an invalid pair: responseStatus is the string "403".
    const pending = free.myMemory('hello', 'en', 'xx');
    (await nextMyMemory()).flush({
      responseData: { translatedText: "'XX' IS AN INVALID TARGET LANGUAGE" },
      responseStatus: '403',
      responseDetails: "'XX' IS AN INVALID TARGET LANGUAGE",
    });
    await expect(pending).rejects.toMatchObject({ reason: 'unsupported' });
  });

  it('MyMemory: a finished quota is reported as quota', async () => {
    const pending = free.myMemory('hallo', 'de', 'en');
    (await nextMyMemory()).flush({
      responseData: {
        translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS',
      },
      responseStatus: 429,
      quotaFinished: true,
    });
    await expect(pending).rejects.toBeInstanceOf(TranslatorRefusal);
    await expect(pending).rejects.toMatchObject({ reason: 'quota' });
  });

  it('Apertium: posts the three-letter pair with unknown-word marks off', async () => {
    const pending = free.apertium('Hola mundo', 'spa|eng');
    const req = await vi.waitFor(() => http.expectOne('https://apertium.org/apy/translate'));
    expect(req.request.method).toBe('POST');
    const body = req.request.body.toString();
    expect(body).toContain('langpair=spa%7Ceng');
    expect(body).toContain('markUnknown=no');
    req.flush({ responseData: { translatedText: 'Hello world' }, responseStatus: 200 });
    await expect(pending).resolves.toBe('Hello world');
  });

  it('Apertium: "That pair is not installed" (HTTP 400) is an unsupported pair', async () => {
    const pending = free.apertium('Hallo', 'deu|eng');
    (await vi.waitFor(() => http.expectOne('https://apertium.org/apy/translate'))).flush(
      { status: 'error', code: 400, explanation: 'That pair is not installed' },
      { status: 400, statusText: 'Bad Request' },
    );
    await expect(pending).rejects.toMatchObject({ reason: 'unsupported' });
  });
});
