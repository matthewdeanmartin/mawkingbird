import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from './auth';
import { ClientPrefs } from './client-prefs';
import { PostingLanguage } from './posting-language';
import { Account } from './models';

describe('PostingLanguage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });
  it('uses the explicitly known single language, while a server default preserves its script tag', () => {
    TestBed.inject(ClientPrefs).setKnownLanguages(['eo']);
    const language = TestBed.inject(PostingLanguage);
    expect(language.default()).toBe('eo');
    expect(language.needsPrompt()).toBe(true);
    TestBed.inject(Auth).account.set({ source: { language: 'zh-Hant' } } as Account);
    expect(language.default()).toBe('zh-Hant');
    expect(language.needsPrompt()).toBe(false);
  });
  it('persists a custom default and suppresses the one-time question after reload', () => {
    const language = TestBed.inject(PostingLanguage);
    language.choose('tlh');
    TestBed.tick();
    expect(language.default()).toBe('tlh');
    expect(language.needsPrompt()).toBe(false);
    expect(JSON.parse(localStorage.getItem('mockingbird_client_prefs')!).postingLanguage).toBe(
      'tlh',
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    expect(TestBed.inject(PostingLanguage).default()).toBe('tlh');
    expect(TestBed.inject(PostingLanguage).needsPrompt()).toBe(false);
  });
  it('does not ask again after dismissal and still supplies a nonempty inferred default', () => {
    const language = TestBed.inject(PostingLanguage);
    language.dismiss();
    TestBed.tick();
    expect(language.needsPrompt()).toBe(false);
    expect(language.default()).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('mockingbird_client_prefs')!).postingLanguageAsked).toBe(
      true,
    );
  });
});
