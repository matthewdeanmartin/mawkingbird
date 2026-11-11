import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PKM_VOCABULARY,
  PkmVocabulary,
  extractTags,
  formatVocabularyField,
  isPkm,
  normalizeVocabulary,
  parseVocabularyField,
  pkmKinds,
  pkmLabel,
  tagFor,
  withPkmTag,
} from './pkm-tags';

const DEFAULTS = DEFAULT_PKM_VOCABULARY;

describe('extractTags', () => {
  it('pulls hashtags out lowercased and without the sigil', () => {
    expect(extractTags('a #Note and a #TODO')).toEqual(['note', 'todo']);
  });

  it('handles unicode tags', () => {
    expect(extractTags('#Aufgabe #日本語')).toEqual(['aufgabe', '日本語']);
  });

  it('finds nothing in a body with no tags', () => {
    expect(extractTags('just some writing')).toEqual([]);
  });
});

describe('pkmKinds', () => {
  it('recognizes the default words', () => {
    expect(pkmKinds('remember this #note', DEFAULTS)).toEqual(['note']);
    expect(pkmKinds('reply later #todo', DEFAULTS)).toEqual(['todo']);
    expect(pkmKinds('dentist #cal', DEFAULTS)).toEqual(['cal']);
    expect(pkmKinds('dentist #calendar', DEFAULTS)).toEqual(['cal']);
  });

  it('is case-insensitive, as Mastodon hashtags are', () => {
    expect(pkmKinds('#TODO', DEFAULTS)).toEqual(['todo']);
    expect(pkmKinds('#ToDo', DEFAULTS)).toEqual(['todo']);
  });

  it('matches whole tags only', () => {
    // Substring matching would quietly file half of someone's posts as notes.
    expect(pkmKinds('#todos', DEFAULTS)).toEqual([]);
    expect(pkmKinds('#notebook', DEFAULTS)).toEqual([]);
    expect(pkmKinds('#calculus', DEFAULTS)).toEqual([]);
  });

  it('returns several kinds for a body carrying several', () => {
    expect(pkmKinds('#note and #todo', DEFAULTS)).toEqual(['todo', 'note']);
  });

  it('returns kinds in a stable order regardless of where they appear', () => {
    expect(pkmKinds('#note then #todo', DEFAULTS)).toEqual(pkmKinds('#todo then #note', DEFAULTS));
  });

  it('honours a custom vocabulary', () => {
    const german: PkmVocabulary = { note: ['notiz'], todo: ['aufgabe'], cal: ['termin'] };
    expect(pkmKinds('#Aufgabe', german)).toEqual(['todo']);
    expect(pkmKinds('#Notiz', german)).toEqual(['note']);
    // The English default is not also matched — the user replaced it.
    expect(pkmKinds('#todo', german)).toEqual([]);
  });

  it('supports several words for one kind', () => {
    const both: PkmVocabulary = { note: ['note', 'notiz'], todo: ['todo'], cal: [] };
    expect(pkmKinds('#notiz', both)).toEqual(['note']);
    expect(pkmKinds('#note', both)).toEqual(['note']);
  });

  it('treats an empty word list as that kind being off', () => {
    // A legitimate choice, and not one to "helpfully" undo.
    const noTodos: PkmVocabulary = { note: ['note'], todo: [], cal: [] };
    expect(pkmKinds('#todo', noTodos)).toEqual([]);
    expect(pkmKinds('#note', noTodos)).toEqual(['note']);
  });

  it('finds nothing in an untagged body', () => {
    expect(pkmKinds('an ordinary post', DEFAULTS)).toEqual([]);
    expect(isPkm('an ordinary post', DEFAULTS)).toBe(false);
    expect(isPkm('tagged #note', DEFAULTS)).toBe(true);
  });
});

describe('vocabulary fields', () => {
  it('parses a comma-separated field, stripping sigils and case', () => {
    expect(parseVocabularyField('#TODO, aufgabe , Tarea')).toEqual(['todo', 'aufgabe', 'tarea']);
  });

  it('drops blanks and duplicates', () => {
    expect(parseVocabularyField('todo, , todo, #todo')).toEqual(['todo']);
  });

  it('returns an empty list for an empty field, meaning the kind is off', () => {
    expect(parseVocabularyField('   ')).toEqual([]);
  });

  it('round-trips through the display format', () => {
    const words = parseVocabularyField('todo, aufgabe');
    expect(parseVocabularyField(formatVocabularyField(words))).toEqual(words);
  });
});

describe('normalizeVocabulary', () => {
  it('cleans every kind', () => {
    expect(normalizeVocabulary({ note: ['#Note'], todo: ['TODO '], cal: [] })).toEqual({
      note: ['note'],
      todo: ['todo'],
      cal: [],
    });
  });

  it('survives junk from storage', () => {
    expect(normalizeVocabulary(null)).toEqual({ note: [], todo: [], cal: [] });
    expect(normalizeVocabulary({ note: 'not an array', todo: [1, 'todo'] } as never)).toEqual({
      note: [],
      todo: ['todo'],
      cal: [],
    });
  });
});

describe('tagFor and pkmLabel', () => {
  it('uses the first configured word, which is the one the user thinks in', () => {
    const vocab: PkmVocabulary = { note: ['notiz', 'note'], todo: ['aufgabe'], cal: [] };
    expect(tagFor('note', vocab)).toBe('notiz');
    expect(pkmLabel('todo', vocab)).toBe('#AUFGABE');
  });

  it('falls back to the built-in word when a kind is off', () => {
    expect(tagFor('todo', { note: [], todo: [], cal: [] })).toBe('todo');
  });
});

describe('withPkmTag', () => {
  it('appends the configured tag', () => {
    expect(withPkmTag('remember this', 'note', DEFAULTS)).toBe('remember this #note');
  });

  it('uses the user own word', () => {
    const german: PkmVocabulary = { note: ['notiz'], todo: ['aufgabe'], cal: [] };
    expect(withPkmTag('etwas', 'todo', german)).toBe('etwas #aufgabe');
  });

  it('is idempotent — tagging twice does not double the tag', () => {
    const once = withPkmTag('body', 'note', DEFAULTS);
    expect(withPkmTag(once, 'note', DEFAULTS)).toBe(once);
  });

  it('does not re-tag a body that already carries the kind under another word', () => {
    const vocab: PkmVocabulary = { note: ['note', 'notiz'], todo: [], cal: [] };
    expect(withPkmTag('already #notiz', 'note', vocab)).toBe('already #notiz');
  });

  it('tags an empty body without a leading space', () => {
    expect(withPkmTag('', 'todo', DEFAULTS)).toBe('#todo');
  });
});
