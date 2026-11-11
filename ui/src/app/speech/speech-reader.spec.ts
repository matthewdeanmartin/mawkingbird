import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../models';
import { SpeechReader, speechText } from './speech-reader';

describe('speechText', () => {
  it('reads the warning, the text, links as sites, image descriptions and poll choices', () => {
    const status = {
      spoiler_text: 'Birds',
      content:
        '<p>Look at <a href="https://www.example.com/x/y">https://www.example.com/x/y</a></p>',
      media_attachments: [{ description: 'A heron' }, { description: '' }],
      poll: { options: [{ title: 'Yes' }, { title: 'No' }] },
      reblog: null,
    } as unknown as Status;
    expect(speechText(status, 'Picture')).toBe(
      'Birds\n\nLook at example.com\n\nPicture: A heron\n\nYes\n\nNo',
    );
  });
});

describe('SpeechReader', () => {
  const spoken: SpeechSynthesisUtterance[] = [];
  const synth = {
    speak: vi.fn((u: SpeechSynthesisUtterance) => spoken.push(u)),
    cancel: vi.fn(),
    getVoices: vi.fn(() => [
      { lang: 'de-DE', localService: false },
      { lang: 'de-AT', localService: true },
    ]),
  };
  const originalSynth = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
  const originalUtterance = (globalThis as Record<string, unknown>)['SpeechSynthesisUtterance'];

  beforeEach(() => {
    spoken.length = 0;
    synth.speak.mockClear();
    synth.cancel.mockClear();
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (globalThis as Record<string, unknown>)['SpeechSynthesisUtterance'] = class {
      lang = '';
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (originalSynth) Object.defineProperty(window, 'speechSynthesis', originalSynth);
    else delete (window as unknown as Record<string, unknown>)['speechSynthesis'];
    (globalThis as Record<string, unknown>)['SpeechSynthesisUtterance'] = originalUtterance;
  });

  it('speaks in the post language with a local voice, and tracks what is speaking', () => {
    const reader = TestBed.inject(SpeechReader);
    expect(reader.supported).toBe(true);
    reader.speak('s1', 'Hallo', 'de');
    expect(synth.cancel).toHaveBeenCalled();
    expect(spoken[0].lang).toBe('de');
    expect((spoken[0].voice as { lang: string }).lang).toBe('de-AT');
    expect(reader.speaking()).toBe('s1');
    spoken[0].onend?.(new Event('end') as SpeechSynthesisEvent);
    expect(reader.speaking()).toBeNull();
  });

  it('stops on request', () => {
    const reader = TestBed.inject(SpeechReader);
    reader.speak('s2', 'Hello');
    reader.stop();
    expect(reader.speaking()).toBeNull();
    expect(synth.cancel).toHaveBeenCalledTimes(2);
  });
});
