import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { analyzeStatusLanguage } from './status-language';
import { analyzeLanguage } from './language-detect';
import {
  AutoTranslateEligibility,
  FeedLanguageFilter,
  KnownLanguages,
} from './trend-language-filter';
import { ClientPrefs } from './client-prefs';
import { Status } from './models';

const ENGLISH = 'This is the book that we read with our friends.';
const DUTCH =
  'Dit is een boek dat ik voor mijn vrienden heb gevonden en het wordt ook morgen gelezen.';
const AMBIGUOUS = 'because which these het een voor';
const status = (content: string, language: string | null = null): Status =>
  ({ id: '1', content, language, spoiler_text: '' }) as Status;

describe('status language structure', () => {
  it('extracts prose around nested link labels without losing inline word boundaries', () => {
    const result = analyzeStatusLanguage(
      `<p>This is the <a href="https://example.test"><b>${DUTCH}</b></a> book that we read with our friends.</p><p><a class="hashtag">#日本語</a></p>`,
    );
    expect(result.language).toBe('en');
    expect(result.prose.language).toBe('en');
    expect(result.segments.find((s) => s.kind === 'link')?.language).toBe('nl');
    expect(
      result.segments
        .filter((s) => s.kind === 'hashtag' || s.kind === 'link')
        .every((s) => !s.included),
    ).toBe(true);
  });

  it('preserves HTML blockquotes, q elements, and decoded entities', () => {
    for (const quote of [
      `<blockquote><p>${DUTCH}</p></blockquote>`,
      `<q>${DUTCH}</q>`,
      `&ldquo;${DUTCH}&rdquo;`,
    ]) {
      const result = analyzeStatusLanguage(`<p>${ENGLISH}</p>${quote}`);
      expect(result.prose.language).toBe('en');
      expect(result.candidates).toEqual(['en', 'nl']);
      expect(result.language).toBeNull();
      expect(result.candidatesComplete).toBe(true);
    }
  });

  it('keeps content warnings in the readability assessment', () => {
    expect(analyzeStatusLanguage(`<p>${ENGLISH}</p>`, DUTCH).candidates).toEqual(['en', 'nl']);
  });

  it('ignores code, scripts, styles and image attributes without inserting content into the document', () => {
    const html = `<p>${ENGLISH}</p><script>${DUTCH}</script><style>${DUTCH}</style><pre>${DUTCH}</pre><code>${DUTCH}</code><img src="https://example.invalid/pixel" alt="${DUTCH}">`;
    expect(analyzeStatusLanguage(html).language).toBe('en');
    expect(document.querySelector('img[src="https://example.invalid/pixel"]')).toBeNull();
  });
});

describe('reader language assessment', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const known = TestBed.inject(KnownLanguages);
    // Isolate policy tests from the test runner's browser locale chain.
    vi.spyOn(known, 'codes').mockImplementation(
      () => new Set(TestBed.inject(ClientPrefs).knownLanguages()),
    );
  });

  it('knows ambiguous Dutch/English only when both possibilities are known', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const filter = TestBed.inject(FeedLanguageFilter);
    prefs.setKnownLanguages(['en', 'nl']);
    prefs.setHideForeignLangPosts(true);
    const post = status(AMBIGUOUS, 'fr');
    const result = filter.languageAssessment(post);
    expect(result.language).toBeNull();
    expect(result.candidates).toEqual(['en', 'nl']);
    expect(result.userKnowsLanguage).toBe(true);
    expect(filter.shouldShow(post)).toBe(true);
    prefs.setKnownLanguages(['en']);
    expect(filter.languageAssessment(post).userKnowsLanguage).toBe(false);
    // Visibility alone does not certify understanding of an uncertain post.
    expect(filter.shouldShow(status(AMBIGUOUS))).toBe(true);
  });

  it('does not claim knowledge from empty, weak, shared-script or truncated candidate sets', () => {
    const known = TestBed.inject(KnownLanguages);
    TestBed.inject(ClientPrefs).setKnownLanguages(['en', 'nl', 'ja', 'ko', 'zh']);
    for (const text of ['', 'because', 'because het', '東京', ENGLISH.repeat(1000)]) {
      expect(known.understands(analyzeLanguage(text)), text.slice(0, 50)).toBe(false);
    }
  });

  it('keeps foreign quotes visible in the knowledge result and never blocks a requested translation', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const filter = TestBed.inject(FeedLanguageFilter);
    const eligibility = TestBed.inject(AutoTranslateEligibility);
    const post = status(`<p>${ENGLISH}</p><blockquote>${DUTCH}</blockquote>`, 'en');
    prefs.setKnownLanguages(['en']);
    expect(filter.languageAssessment(post).prose.language).toBe('en');
    expect(filter.languageAssessment(post).userKnowsLanguage).toBe(false);
    expect(eligibility.isAlreadyTargetLanguage(post, 'en')).toBe(false);
    prefs.setKnownLanguages(['en', 'nl']);
    expect(filter.languageAssessment(post).userKnowsLanguage).toBe(true);
    // Knowing Dutch does not mean that translating Dutch into English is pointless.
    expect(eligibility.isAlreadyTargetLanguage(post, 'en')).toBe(false);
  });

  it('uses current preferences, edited text and edited warnings while caching pure analysis', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const filter = TestBed.inject(FeedLanguageFilter);
    prefs.setKnownLanguages(['en']);
    const post = status(ENGLISH);
    const first = filter.languageAssessment(post);
    expect(filter.languageAssessment(post).segments).toBe(first.segments);
    expect(first.userKnowsLanguage).toBe(true);
    post.content = DUTCH;
    expect(filter.languageAssessment(post).language).toBe('nl');
    expect(filter.languageAssessment(post).userKnowsLanguage).toBe(false);
    prefs.setKnownLanguages(['en', 'nl']);
    expect(filter.languageAssessment(post).userKnowsLanguage).toBe(true);
    post.spoiler_text = 'これは日本語で書かれた文章です。';
    expect(filter.languageAssessment(post).userKnowsLanguage).toBe(false);
    const boost = { ...status('wrapper'), reblog: post };
    expect(filter.languageAssessment(boost).segments).toBe(
      filter.languageAssessment(post).segments,
    );
  });

  it('respects feed narrowing separately from knowledge', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const filter = TestBed.inject(FeedLanguageFilter);
    prefs.setKnownLanguages(['en', 'nl']);
    prefs.setFeedLanguages(['en']);
    expect(filter.languageAssessment(status(DUTCH)).userKnowsLanguage).toBe(true);
    expect(filter.hideReason(status(DUTCH))).toBe('foreign');
  });

  it('skips automatic translation when all candidates are known, preserving learning priority', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const eligibility = TestBed.inject(AutoTranslateEligibility);
    prefs.setKnownLanguages(['en', 'nl']);
    prefs.setAutoTranslateMode('view');
    prefs.setTranslateAllForeign(true);
    expect(eligibility.skipReason(status(AMBIGUOUS))).toBe('known');
    prefs.setLearningLanguages(['nl']);
    expect(eligibility.skipReason(status(DUTCH))).toBeNull();
  });
});
