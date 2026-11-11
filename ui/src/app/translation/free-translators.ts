import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { externalFetch } from '../platform/http/external-fetch';
import { APERTIUM_API } from './pair-catalog';

export const MYMEMORY_API = 'https://api.mymemory.translated.net/get';
/** MyMemory rejects a `q` over 500 bytes; stay clear of the edge. */
export const MYMEMORY_CHUNK_BYTES = 450;
const REQUEST_TIMEOUT_MS = 15_000;

/** Thrown for a refusal that says something about the pair or the quota. */
export class TranslatorRefusal extends Error {
  constructor(
    readonly reason: 'unsupported' | 'quota' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

interface MyMemoryReply {
  responseData?: { translatedText?: string };
  /** A number on success, sometimes a string ("403") on refusal — verified 2026-11-08. */
  responseStatus?: number | string;
  responseDetails?: string;
  quotaFinished?: boolean | null;
}

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;

/**
 * Split text into pieces of at most `limit` UTF-8 bytes, breaking at paragraph,
 * then sentence, then word boundaries; a single over-long word is cut hard.
 * Joining the pieces with their separators reproduces the text.
 */
export function chunkText(text: string, limit = MYMEMORY_CHUNK_BYTES): string[] {
  const pieces: string[] = [];
  const push = (piece: string) => {
    if (byteLength(piece) <= limit) {
      pieces.push(piece);
      return;
    }
    let rest = piece;
    while (byteLength(rest) > limit) {
      let cut = rest.length;
      while (cut > 0 && byteLength(rest.slice(0, cut)) > limit) cut--;
      const space = rest.lastIndexOf(' ', cut);
      if (space > cut / 2) cut = space + 1;
      pieces.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) pieces.push(rest);
  };
  // Sentences (keeping their trailing space/newline) packed greedily.
  const matched = text.match(/[^.!?。！？\n]*[.!?。！？]+[^\S\n]*|[^.!?。！？\n]+[^\S\n]*|\n+/g);
  // Never lose text: if the split does not reproduce the input, fall back to word cuts.
  const sentences = matched && matched.join('') === text ? matched : [text];
  let current = '';
  for (const sentence of sentences) {
    if (byteLength(current + sentence) <= limit) {
      current += sentence;
      continue;
    }
    if (current) pieces.push(current);
    current = '';
    if (byteLength(sentence) <= limit) current = sentence;
    else push(sentence);
  }
  if (current) pieces.push(current);
  return pieces;
}

/** MyMemory and Apertium: free public services, called straight from the browser (both send CORS headers). */
@Injectable({ providedIn: 'root' })
export class FreeTranslators {
  private http = inject(HttpClient);

  /**
   * Translate with MyMemory. Errors arrive inside an HTTP 200, as a
   * `responseStatus` other than 200 with the message in `translatedText`.
   */
  async myMemory(text: string, source: string, target: string, email = ''): Promise<string> {
    const out: string[] = [];
    for (const piece of chunkText(text)) {
      if (!piece.trim()) {
        out.push(piece);
        continue;
      }
      let params = new HttpParams().set('q', piece).set('langpair', `${source}|${target}`);
      if (email) params = params.set('de', email);
      const reply = await firstValueFrom(
        this.http
          .get<MyMemoryReply>(MYMEMORY_API, { params, context: externalFetch() })
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      const status = Number(reply.responseStatus);
      const details = reply.responseDetails || reply.responseData?.translatedText || '';
      if (reply.quotaFinished || status === 429) {
        throw new TranslatorRefusal('quota', details || 'MyMemory daily quota used up.');
      }
      if (status !== 200) {
        const unsupported = /LANGUAGE|LANGPAIR|DISTINCT/i.test(details);
        throw new TranslatorRefusal(unsupported ? 'unsupported' : 'failed', details);
      }
      // Keep the piece's own trailing whitespace: the service trims it.
      const trailing = piece.match(/\s*$/)?.[0] ?? '';
      out.push((reply.responseData?.translatedText ?? '').trimEnd() + trailing);
    }
    return out.join('').trim();
  }

  /** Translate with Apertium's public server; `pair` is ISO 639-3 (`spa|eng`). */
  async apertium(text: string, pair: string): Promise<string> {
    const body = new HttpParams().set('langpair', pair).set('markUnknown', 'no').set('q', text);
    try {
      const reply = await firstValueFrom(
        this.http
          .post<{ responseData?: { translatedText?: string }; responseStatus?: number }>(
            `${APERTIUM_API}/translate`,
            body,
            { context: externalFetch() },
          )
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      if (Number(reply.responseStatus ?? 200) !== 200 || !reply.responseData?.translatedText) {
        throw new TranslatorRefusal('failed', 'Apertium could not translate this.');
      }
      return reply.responseData.translatedText;
    } catch (error) {
      if (error instanceof TranslatorRefusal) throw error;
      // "That pair is not installed" comes back as HTTP 400.
      const status = (error as { status?: number }).status;
      throw new TranslatorRefusal(
        status === 400 ? 'unsupported' : 'failed',
        'Apertium could not translate this.',
      );
    }
  }
}
