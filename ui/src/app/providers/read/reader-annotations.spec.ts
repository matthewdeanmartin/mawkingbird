import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Anchor,
  ANNOTATIONS_KEY_BASE,
  ANNOTATIONS_MAX_AGE_MS,
  AnnotationMap,
  anchorMatches,
  pruneAnnotations,
  ReaderAnnotations,
} from './reader-annotations';

const anchor = (quote: string, over: Partial<Anchor> = {}): Anchor => ({
  block: 0,
  start: 0,
  end: quote.length,
  quote,
  ...over,
});

describe('the quote check', () => {
  /**
   * The trust model of the whole feature: an anchor is only honoured while the
   * text underneath it still says what it said when the highlight was made.
   */
  it('accepts an anchor sitting on its own quote', () => {
    expect(anchorMatches(anchor('a phrase'), 'a phrase and more')).toBe(true);
  });

  it('rejects one whose text was rewritten', () => {
    expect(anchorMatches(anchor('a phrase'), 'something else now')).toBe(false);
  });

  it('rejects one whose block is gone', () => {
    expect(anchorMatches(anchor('a phrase'), undefined)).toBe(false);
  });

  /** Re-extraction can re-wrap a paragraph without changing a word of it. */
  it('ignores whitespace differences, which are not drift', () => {
    expect(anchorMatches({ block: 0, start: 0, end: 8, quote: 'a  phrase' }, 'a phrase')).toBe(
      true,
    );
  });

  it('rejects an empty quote rather than matching everything', () => {
    expect(anchorMatches({ block: 0, start: 0, end: 0, quote: '' }, 'anything')).toBe(false);
  });
});

describe('pruning annotations', () => {
  const at = (updatedAt: number): AnnotationMap => ({
    doc: [{ id: '1', anchor: anchor('q'), note: '', createdAt: updatedAt, updatedAt }],
  });

  it('drops what is past the age cap and keeps what is not', () => {
    const now = Date.now();
    expect(pruneAnnotations(at(now - ANNOTATIONS_MAX_AGE_MS - 1), now).dropped).toBe(1);
    expect(pruneAnnotations(at(now - 1000), now).dropped).toBe(0);
  });

  it('drops a document entirely when nothing of it survives', () => {
    const now = Date.now();
    expect(pruneAnnotations(at(now - ANNOTATIONS_MAX_AGE_MS - 1), now).map).toEqual({});
  });

  it('evicts least-recently-touched first when over the entry cap', () => {
    const map: AnnotationMap = {
      doc: Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        anchor: anchor('q'),
        note: '',
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      })),
    };
    const { map: kept, dropped } = pruneAnnotations(map, 1000, ANNOTATIONS_MAX_AGE_MS, 3);
    expect(dropped).toBe(2);
    expect(kept['doc'].map((entry) => entry.id)).toEqual(['2', '3', '4']);
  });
});

describe('ReaderAnnotations', () => {
  let store: ReaderAnnotations;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(ReaderAnnotations);
  });

  afterEach(() => localStorage.clear());

  it('keeps annotations per document', () => {
    store.add('doc-a', anchor('one'));
    store.add('doc-b', anchor('two'));

    expect(store.forDocument('doc-a')).toHaveLength(1);
    expect(store.countFor('doc-b')).toBe(1);
    expect(store.forDocument('doc-c')).toHaveLength(0);
  });

  it('stores a bare highlight and a noted one alike', () => {
    const bare = store.add('doc', anchor('one'));
    const noted = store.add('doc', anchor('two'), 'my thought');

    expect(bare.note).toBe('');
    expect(noted.note).toBe('my thought');
    expect(store.total()).toBe(2);
  });

  it('edits a note in place', () => {
    const entry = store.add('doc', anchor('one'));
    store.setNote('doc', entry.id, 'second thoughts');

    expect(store.forDocument('doc')[0].note).toBe('second thoughts');
  });

  it('ignores an edit to something that is not there', () => {
    store.setNote('doc', 'nope', 'text');
    expect(store.total()).toBe(0);
  });

  it('removes one annotation, and the document when it was the last', () => {
    const first = store.add('doc', anchor('one'));
    const second = store.add('doc', anchor('two'));

    store.remove('doc', first.id);
    expect(store.forDocument('doc')).toHaveLength(1);

    store.remove('doc', second.id);
    expect(store.snapshot()).toEqual({});
  });

  it('survives a reload', () => {
    store.add('doc', anchor('one'), 'kept');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ReaderAnnotations);

    expect(reloaded.forDocument('doc')[0].note).toBe('kept');
  });

  /** One hand-edited entry costs that entry, never the store. */
  it('drops malformed entries on load without losing the good ones', () => {
    localStorage.setItem(
      `${ANNOTATIONS_KEY_BASE}`,
      JSON.stringify({
        doc: [
          {
            id: 'good',
            anchor: anchor('q'),
            note: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          { id: 'bad', note: 'no anchor', createdAt: Date.now() },
          'not even an object',
        ],
        broken: 'not an array',
      }),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ReaderAnnotations);

    expect(reloaded.forDocument('doc').map((entry) => entry.id)).toEqual(['good']);
    expect(reloaded.forDocument('broken')).toHaveLength(0);
  });

  it('survives a store that is not JSON at all', () => {
    localStorage.setItem(ANNOTATIONS_KEY_BASE, '{{{');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ReaderAnnotations).total()).toBe(0);
  });

  /**
   * A note is the reader's own writing — the one thing in the reader that must
   * be exportable, because a store only its author can read is one that loses
   * work when the app changes.
   */
  it('exports everything it holds', () => {
    store.add('doc', anchor('one'), 'a thought');
    const exported = store.snapshot();

    expect(exported['doc'][0].note).toBe('a thought');
    // A copy: mutating the export must not reach into the store.
    exported['doc'].push(exported['doc'][0]);
    expect(store.forDocument('doc')).toHaveLength(1);
  });

  it('clears one document, and everything', () => {
    store.add('doc-a', anchor('one'));
    store.add('doc-b', anchor('two'));

    store.clearDocument('doc-a');
    expect(store.total()).toBe(1);

    store.clear();
    expect(store.total()).toBe(0);
  });
});
