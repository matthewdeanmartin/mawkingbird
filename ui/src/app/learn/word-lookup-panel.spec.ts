import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../models';
import { OpenRouterChat } from '../providers/openrouter/openrouter-chat';
import { OpenRouterSession } from '../providers/openrouter/openrouter-session';
import { dictionaryShard } from './dictionary/dictionary';
import { forgetLoadedDictionaries } from './dictionary/dictionary-registry';
import { WordLookupPanel } from './word-lookup-panel';

const SHARDS = 4;
const ENTRY = { w: ['食べる'], r: ['たべる'], s: [{ p: ['v1'], g: ['to eat'] }], c: 1 };

/** The JMdict files, as served under dict/jmdict/. */
function served(url: string): unknown {
  const file = url.split('/').pop();
  if (file === 'manifest.json') {
    return {
      id: 'jmdict',
      language: 'ja',
      version: 't',
      date: null,
      commonOnly: true,
      entries: 1,
      shards: SHARDS,
      licence: 'CC BY-SA 4.0',
      tags: { v1: 'Ichidan verb' },
    };
  }
  const shard = { e: [] as unknown[], k: {} as Record<string, number[]> };
  for (const key of ['食べる', 'たべる']) {
    if (`${dictionaryShard(key, SHARDS)}.json` !== file) continue;
    if (!shard.e.length) shard.e.push(ENTRY);
    shard.k[key] = [0];
  }
  return shard;
}

const post = { id: 'p1', content: '<p>昨日は食べなかった。</p>', spoiler_text: '' } as Status;

describe('WordLookupPanel (L1)', () => {
  let complete: ReturnType<typeof vi.fn>;
  const connected = signal(false);

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({ ok: true, json: async () => served(String(url)) })),
    );
    complete = vi.fn().mockResolvedValue('Here 食べなかった means “did not eat”.');
    connected.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: OpenRouterChat, useValue: { complete } },
        { provide: OpenRouterSession, useValue: { connected } },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    forgetLoadedDictionaries();
  });

  function open() {
    const fixture = TestBed.createComponent(WordLookupPanel);
    fixture.componentRef.setInput('status', post);
    fixture.componentRef.setInput('language', 'ja');
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  /** The word starting with 食: how ICU splits 食べなかった varies by engine. */
  const eatButton = (fixture: { nativeElement: unknown }) =>
    [...el(fixture).querySelectorAll('button.word')].find((b) =>
      b.textContent?.startsWith('食'),
    ) as HTMLButtonElement | undefined;

  it('shows the post as tappable words', () => {
    const fixture = open();
    expect(el(fixture).querySelector('.words')?.textContent).toContain('昨日は食べなかった。');
    expect(el(fixture).querySelectorAll('button.word').length).toBeGreaterThan(1);
  });

  it('looks up the tapped word, deinflected, and credits the dictionary', async () => {
    const fixture = open();
    const word = eatButton(fixture);
    expect(word).toBeTruthy();
    word!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      const text = el(fixture).textContent ?? '';
      expect(text).toContain('食べる');
      expect(text).toContain('to eat');
      expect(text).toContain('negative, past');
      expect(text).toContain('JMdict, Electronic Dictionary Research and Development Group');
    });
    // No OpenRouter key: no AI button.
    expect(el(fixture).textContent).not.toContain('Explain in this sentence');
  });

  it('explains the word in its sentence with the reader’s OpenRouter key', async () => {
    connected.set(true);
    const fixture = open();
    eatButton(fixture)!.click();
    const explain = await vi.waitFor(() => {
      fixture.detectChanges();
      const found = [...el(fixture).querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Explain in this sentence'),
      );
      expect(found).toBeTruthy();
      return found!;
    });
    explain.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el(fixture).textContent).toContain('did not eat');
    });
    const prompt = complete.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('食べなかった');
    expect(prompt).toContain('dictionary form: 食べる');
  });

  it('says so when the dictionary cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => null })),
    );
    const fixture = TestBed.createComponent(WordLookupPanel);
    fixture.componentRef.setInput('status', post);
    fixture.componentRef.setInput('language', 'zh');
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el(fixture).textContent).toContain('not available yet');
    });
  });
});
