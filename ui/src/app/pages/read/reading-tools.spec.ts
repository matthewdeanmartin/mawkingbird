import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientPrefs } from '../../client-prefs';
import { ReaderAnnotations } from '../../providers/read/reader-annotations';
import { paginateMarkdown } from '../rss/article-pages';
import { ReadingTools } from './reading-tools';

const DOC = [
  'The first paragraph, which is where the interesting phrase lives.',
  'A second paragraph, entirely separate from the first.',
].join('\n\n');

describe('ReadingTools', () => {
  let tools: ReadingTools;
  let annotations: ReaderAnnotations;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [ReadingTools] });
    tools = TestBed.inject(ReadingTools);
    annotations = TestBed.inject(ReaderAnnotations);
    tools.setDocument('doc-1', DOC, paginateMarkdown(DOC));
  });

  afterEach(() => localStorage.clear());

  describe('highlighting', () => {
    it('marks the selected passage', () => {
      tools.selection.set('interesting phrase');
      const id = tools.toggleHighlight();

      expect(id).not.toBeNull();
      expect(annotations.forDocument('doc-1')).toHaveLength(1);
      expect(annotations.forDocument('doc-1')[0].anchor.quote).toBe('interesting phrase');
    });

    it('clears the selection after marking, so the popover goes', () => {
      tools.selection.set('interesting phrase');
      tools.toggleHighlight();
      expect(tools.selection()).toBe('');
    });

    /** Pressing Highlight on something already highlighted removes it. */
    it('unmarks a passage that is already marked', () => {
      tools.selection.set('interesting phrase');
      tools.toggleHighlight();

      tools.selection.set('interesting phrase');
      expect(tools.selectionIsHighlighted()).toBe(true);
      tools.toggleHighlight();

      expect(annotations.forDocument('doc-1')).toHaveLength(0);
    });

    it('does nothing for a selection that is not in the document', () => {
      tools.selection.set('a phrase from somewhere else entirely');
      expect(tools.toggleHighlight()).toBeNull();
      expect(annotations.forDocument('doc-1')).toHaveLength(0);
    });
  });

  describe('notes', () => {
    it('highlights and opens the composer in one gesture', () => {
      tools.selection.set('interesting phrase');
      tools.startNote();

      expect(tools.editing()).not.toBeNull();
      expect(annotations.forDocument('doc-1')).toHaveLength(1);
    });

    it('saves what was written', () => {
      tools.selection.set('interesting phrase');
      tools.startNote();
      tools.draftNote.set('  a thought  ');
      tools.saveNote();

      expect(annotations.forDocument('doc-1')[0].note).toBe('a thought');
      expect(tools.editing()).toBeNull();
    });

    /**
     * The mark was the first half of the gesture. Undoing it because the reader
     * changed their mind about writing would be surprising.
     */
    it('keeps the highlight when the composer is cancelled', () => {
      tools.selection.set('interesting phrase');
      tools.startNote();
      tools.cancelNote();

      expect(annotations.forDocument('doc-1')).toHaveLength(1);
      expect(tools.editing()).toBeNull();
    });

    it('reopens an existing note with its text', () => {
      tools.selection.set('interesting phrase');
      tools.startNote();
      tools.draftNote.set('first thought');
      tools.saveNote();

      const [entry] = annotations.forDocument('doc-1');
      tools.editNote(entry.id, entry.note);

      expect(tools.draftNote()).toBe('first thought');
    });

    it('removes a note, and closes the composer if it was open on it', () => {
      tools.selection.set('interesting phrase');
      tools.startNote();
      const [entry] = annotations.forDocument('doc-1');

      tools.removeNote(entry.id);

      expect(annotations.forDocument('doc-1')).toHaveLength(0);
      expect(tools.editing()).toBeNull();
    });
  });

  describe('the rail', () => {
    /**
     * A bare highlight is not a note. Someone marking passages as they read has
     * asked for marks in the text, not a column beside it.
     */
    it('stays away for a document with only bare highlights', () => {
      tools.selection.set('interesting phrase');
      tools.toggleHighlight();

      expect(tools.notes()).toHaveLength(1);
      expect(tools.hasNotes()).toBe(false);
    });

    it('appears once something is written', () => {
      tools.selection.set('interesting phrase');
      tools.startNote();
      tools.draftNote.set('a thought');
      tools.saveNote();

      expect(tools.hasNotes()).toBe(true);
    });

    it('reports which page each note is on', () => {
      tools.selection.set('interesting phrase');
      tools.toggleHighlight();

      expect(tools.notes()[0].page).toBe(1);
      expect(tools.notes()[0].moved).toBe(false);
    });

    /**
     * The publisher rewrote the article. The note is the reader's own writing
     * and is kept; the anchor is not trusted, so nothing is drawn in the text.
     */
    it('reports a drifted anchor as moved rather than drawing it', () => {
      tools.selection.set('interesting phrase');
      tools.toggleHighlight();

      const rewritten = 'The first paragraph, completely rewritten by the publisher.';
      tools.setDocument('doc-1', rewritten, paginateMarkdown(rewritten));

      expect(tools.notes()[0].moved).toBe(true);
      expect(tools.notes()[0].page).toBeNull();
      // And so it is not offered for marking.
      expect(tools.intactQuotes()).toHaveLength(0);
    });
  });

  describe('the dictionary', () => {
    it('builds a lookup for the configured provider', () => {
      expect(tools.defineUrl('otter')).toBe('https://en.wiktionary.org/wiki/otter');
    });

    it('follows the reader’s choice of provider', () => {
      TestBed.inject(ClientPrefs).setReaderDictionary('merriam');
      expect(tools.defineUrl('otter')).toBe('https://www.merriam-webster.com/dictionary/otter');
    });

    /** A German document should send its reader to the German entry. */
    it('picks the edition for the document’s own language', () => {
      const german = [
        'Der erste Absatz, und das ist auch gut so, denn wir brauchen genug Text.',
        'Ein zweiter Absatz mit noch mehr Wörtern, damit die Sprache erkannt wird.',
      ].join('\n\n');
      tools.setDocument('doc-de', german, paginateMarkdown(german));

      expect(tools.language()).toBe('de');
      expect(tools.defineUrl('Zeitgeist')).toBe('https://de.wiktionary.org/wiki/Zeitgeist');
    });
  });

  describe('moving between documents', () => {
    it('drops the selection and any open composer', () => {
      tools.selection.set('interesting phrase');
      tools.startNote();

      tools.setDocument('doc-2', 'Another document entirely.', ['Another document entirely.']);

      expect(tools.editing()).toBeNull();
      expect(tools.selection()).toBe('');
    });

    it('shows the new document’s notes, not the old one’s', () => {
      tools.selection.set('interesting phrase');
      tools.toggleHighlight();

      tools.setDocument('doc-2', 'Another document entirely.', ['Another document entirely.']);

      expect(tools.notes()).toHaveLength(0);
    });
  });
});
