import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TRANSLATION_CHOICE, TranslationPreference } from './translation-preference';

const KEY = 'mockingbird_translation_preference';

describe('TranslationPreference', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  function pref(): TranslationPreference {
    return TestBed.inject(TranslationPreference);
  }

  it("defaults to the server's own translation, which costs the user nothing", () => {
    // A settings default does not get to sign someone up for a paid API.
    expect(DEFAULT_TRANSLATION_CHOICE).toBe('server');
    expect(pref().choice()).toBe('server');
  });

  it('persists a change to AI', () => {
    pref().set('ai');

    expect(localStorage.getItem(KEY)).toBe('ai');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(TranslationPreference).choice()).toBe('ai');
  });

  it('persists "ask"', () => {
    pref().set('ask');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(TranslationPreference).choice()).toBe('ask');
  });

  it('stores nothing when set back to the default, rather than writing it out', () => {
    // Absent means "never chose", which is what the storage inspector should show.
    const store = pref();
    store.set('ai');
    store.set('server');

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(store.choice()).toBe('server');
  });

  it('reset returns to the server default', () => {
    const store = pref();
    store.set('ai');
    store.reset();

    expect(store.choice()).toBe('server');
  });

  it('falls back to the default for a stored value it does not recognise', () => {
    // Hand-edited, or written by a future version. Never trust it, never throw.
    localStorage.setItem(KEY, 'chatgpt-please');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(TranslationPreference).choice()).toBe('server');
  });

  it('ignores an invalid set rather than storing garbage', () => {
    const store = pref();
    store.set('nonsense' as never);

    expect(store.choice()).toBe('server');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('offers all three states, with the free one first', () => {
    expect(pref().options.map((option) => option.value)).toEqual(['server', 'ai', 'ask']);
  });
});
