import { TestBed } from '@angular/core/testing';
import { FutureTagHints, FutureTagTopic, suggestFutureTags } from './future-tag-hints';

const KEY = 'mockingbird_future_tag_hints';

const italian: FutureTagTopic = {
  lang: 'it',
  futures: [
    { tag: 'Fantascienza', source: 'ScienceFiction' },
    { tag: 'LibriFantasy', source: 'FantasyBooks' },
    { tag: 'StarTrekIT', source: 'StarTrek' },
  ],
  topicTags: ['ScienceFiction', 'SciFi', 'FantasyBooks', 'StarTrek', 'Fantascienza'],
};

describe('suggestFutureTags', () => {
  const topics = { 'science-fiction.it': italian };

  it('suggests future tags for a post in the page language that uses a topic tag', () => {
    expect(suggestFutureTags(topics, 'Appena finito Dune #SciFi', 'it')).toEqual([
      'Fantascienza',
      'LibriFantasy',
    ]);
  });

  it('puts the future tag of a source the post uses first', () => {
    expect(suggestFutureTags(topics, 'Nuova stagione #StarTrek', 'it')[0]).toBe('StarTrekIT');
  });

  it('says nothing for another language, no language, or no topic tag', () => {
    expect(suggestFutureTags(topics, 'Just read Dune #SciFi', 'en')).toEqual([]);
    expect(suggestFutureTags(topics, 'Appena finito Dune #SciFi', null)).toEqual([]);
    expect(suggestFutureTags(topics, 'Pasta al pomodoro #cucina', 'it')).toEqual([]);
  });

  it('never suggests a tag the post already has, in any case', () => {
    expect(suggestFutureTags(topics, '#SciFi #fantascienza', 'it')).toEqual([
      'LibriFantasy',
      'StarTrekIT',
    ]);
  });
});

describe('FutureTagHints', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it('remembers a topic across instances', () => {
    TestBed.inject(FutureTagHints).remember('science-fiction.it', italian);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')['science-fiction.it'].lang).toBe('it');
    TestBed.resetTestingModule();
    expect(TestBed.inject(FutureTagHints).topics()['science-fiction.it']).toEqual(italian);
  });

  it('ignores a page without future tags and survives a corrupt store', () => {
    localStorage.setItem(KEY, '{not json');
    const hints = TestBed.inject(FutureTagHints);
    expect(hints.topics()).toEqual({});
    hints.remember('science-fiction.en', { lang: 'en', futures: [], topicTags: ['SciFi'] });
    expect(hints.topics()).toEqual({});
  });
});
