import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { portableKeys } from '../platform/storage/portable-config';
import { classifyStorageKey } from '../platform/storage/storage-registry';
import {
  DEFAULT_MYMEMORY_HARD_LIMIT,
  MYMEMORY_EMAIL_DAILY_CHARS,
  TranslationUsage,
} from './translation-usage';
import { BrowserTranslator } from './browser-translator';
import { APERTIUM_KEY, MYMEMORY_KEY, TranslationConnectors } from './translation-connectors';

describe('TranslationConnectors', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('is off until switched on, and survives a reload', () => {
    const connectors = TestBed.inject(TranslationConnectors);
    expect(connectors.myMemoryEnabled()).toBe(false);
    expect(connectors.apertiumEnabled()).toBe(false);
    connectors.setMyMemoryEnabled(true);
    connectors.setApertiumEnabled(true);
    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(TranslationConnectors);
    expect(reloaded.myMemoryEnabled()).toBe(true);
    expect(reloaded.apertiumEnabled()).toBe(true);
    reloaded.setApertiumEnabled(false);
    expect(localStorage.getItem(APERTIUM_KEY)).toBeNull();
  });

  it('raises the MyMemory budget to the email tier, and back, unless customised', () => {
    const connectors = TestBed.inject(TranslationConnectors);
    const usage = TestBed.inject(TranslationUsage);
    connectors.setMyMemoryEmail('me@example.org');
    expect(usage.hardLimit('mymemory')).toBe(MYMEMORY_EMAIL_DAILY_CHARS);
    connectors.setMyMemoryEmail('');
    expect(usage.hardLimit('mymemory')).toBe(DEFAULT_MYMEMORY_HARD_LIMIT);
    usage.setLimits('mymemory', 100, 200);
    connectors.setMyMemoryEmail('me@example.org');
    expect(usage.hardLimit('mymemory')).toBe(200);
  });

  it('refuses something that is not an email', () => {
    expect(() => TestBed.inject(TranslationConnectors).setMyMemoryEmail('nope')).toThrow();
  });

  it('keeps the MyMemory email private and out of shareable exports', () => {
    expect(classifyStorageKey(MYMEMORY_KEY)?.sensitivity).toBe('private');
    expect(portableKeys('standard')).not.toContain(MYMEMORY_KEY);
  });
});

describe('BrowserTranslator', () => {
  const scope = globalThis as unknown as { Translator?: unknown };
  afterEach(() => {
    delete scope.Translator;
    vi.restoreAllMocks();
  });

  it('reports no support and "unavailable" when the browser has no Translator', async () => {
    const browser = TestBed.inject(BrowserTranslator);
    expect(browser.supported()).toBe(false);
    await expect(browser.availability('de', 'en')).resolves.toBe('unavailable');
  });

  it('translates paragraph by paragraph and reuses one translator per pair', async () => {
    const translate = vi.fn(async (text: string) => `EN(${text})`);
    const create = vi.fn(async () => ({ translate }));
    scope.Translator = { availability: vi.fn(async () => 'available'), create };
    const browser = TestBed.inject(BrowserTranslator);
    expect(browser.supported()).toBe(true);
    await expect(browser.translate('Eins\n\nZwei', 'de', 'en')).resolves.toBe(
      'EN(Eins)\n\nEN(Zwei)',
    );
    await browser.translate('Drei', 'de', 'en');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed create so the next press can try again', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('gesture'), { name: 'NotAllowedError' }))
      .mockResolvedValue({ translate: async () => 'ok' });
    scope.Translator = { availability: async () => 'downloadable', create };
    const browser = TestBed.inject(BrowserTranslator);
    await expect(browser.translate('x', 'de', 'en')).rejects.toMatchObject({
      name: 'NotAllowedError',
    });
    await expect(browser.translate('x', 'de', 'en')).resolves.toBe('ok');
  });
});
