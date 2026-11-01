import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslocoService } from '@jsverse/transloco';
import { negotiateLocale, supportedLocales } from './locale';
import { HttpTranslocoLoader, provideI18n, translationUrl } from './i18n.config';

describe('Runtime translation URLs', () => {
  afterEach(() => vi.restoreAllMocks());
  it('separates releases without crossing deployment roots for either active or fallback languages', () => {
    for (const base of [
      'https://mawkingbird.com/',
      'https://mawkingbird.com/canary/',
      'https://mawkingbird.com/test/',
    ]) {
      for (const lang of ['en', 'es']) {
        expect(translationUrl(lang, base, 'new-commit')).toBe(
          `${base}i18n/${lang}.json?v=new-commit`,
        );
        expect(translationUrl(lang, base, 'old-commit')).not.toBe(
          translationUrl(lang, base, 'new-commit'),
        );
      }
    }
    expect(translationUrl('en', 'https://mawkingbird.com/canary/', null)).toBe(
      'https://mawkingbird.com/canary/i18n/en.json',
    );
  });
  it('recognizes an explicitly pinned Hindi page without promoting Hindi in production', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18n()],
    });
    const transloco = TestBed.inject(TranslocoService);
    expect(transloco.getAvailableLangs()).toContain('hi');
    expect(supportedLocales('https://mawkingbird.com/')).not.toContain('hi');
    expect(negotiateLocale(['hi-IN'], supportedLocales('https://mawkingbird.com/'))).toBe('en');
  });
  it('loads through the release-aware URL helper using the actual deployment base', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue('https://mawkingbird.com/canary/');
    const http = TestBed.inject(HttpTestingController);
    let result: unknown;
    TestBed.inject(HttpTranslocoLoader)
      .getTranslation('en')
      .subscribe((value) => (result = value));
    http
      .expectOne(translationUrl('en', document.baseURI))
      .flush({ cta: { 'rss.title': 'RSS feeds' } });
    expect(result).toEqual({ cta: { 'rss.title': 'RSS feeds' } });
    http.verify();
  });
});
