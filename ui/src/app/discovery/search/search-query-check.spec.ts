import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { describeSearchError, filtersWithoutTerm, languageInQuery } from './search-query-check';

describe('filtersWithoutTerm', () => {
  it('flags queries Mastodon refuses: filters and exclusions only', () => {
    expect(filtersWithoutTerm('language:ms')).toEqual(['language:ms']);
    expect(filtersWithoutTerm('language:ms -is:sensitive')).toEqual([
      'language:ms',
      '-is:sensitive',
    ]);
    expect(filtersWithoutTerm('-cats has:image')).toEqual(['-cats', 'has:image']);
    expect(filtersWithoutTerm('""')).toEqual(['""']);
  });

  it('accepts anything with a positive word, phrase or hashtag', () => {
    expect(filtersWithoutTerm('esp32')).toBeNull();
    expect(filtersWithoutTerm('kucing language:ms')).toBeNull();
    expect(filtersWithoutTerm('"selamat pagi" language:ms')).toBeNull();
    expect(filtersWithoutTerm('#malaysia language:ms')).toBeNull();
    expect(filtersWithoutTerm('+kopi')).toBeNull();
  });

  it('allows the server’s exceptions: your own posts', () => {
    expect(filtersWithoutTerm('in:library has:image')).toBeNull();
    expect(filtersWithoutTerm('from:me language:ms')).toBeNull();
  });

  it('leaves an empty box alone (handled elsewhere)', () => {
    expect(filtersWithoutTerm('   ')).toBeNull();
  });
});

describe('describeSearchError', () => {
  it('passes the server’s own words through', () => {
    const error = new HttpErrorResponse({ status: 503, error: { error: 'Search is down' } });
    expect(describeSearchError(error)).toEqual({
      kind: 'failed',
      status: 503,
      detail: 'Search is down',
    });
  });

  it('recognises Mastodon’s keyword-required refusal', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { error: 'At least one keyword or phrase is required' },
    });
    expect(describeSearchError(error).kind).toBe('needsWord');
  });

  it('copes with no body, a string body, and a non-HTTP error', () => {
    expect(describeSearchError(new HttpErrorResponse({ status: 0 }))).toEqual({
      kind: 'failed',
      status: 0,
    });
    expect(describeSearchError(new HttpErrorResponse({ status: 500, error: '<html>' }))).toEqual({
      kind: 'failed',
      status: 500,
    });
    expect(describeSearchError(new Error('x'))).toEqual({ kind: 'failed' });
  });
});

describe('languageInQuery', () => {
  it('reads a language: filter as a bare code', () => {
    expect(languageInQuery('language:ms')).toBe('ms');
    expect(languageInQuery('kopi +language:pt-BR')).toBe('pt');
    expect(languageInQuery('-language:en cats')).toBe('');
    expect(languageInQuery('cats')).toBe('');
  });
});
