import { describe, expect, it } from 'vitest';
import {
  parseSuggestionReply,
  parseSuggestions,
  suggestionSchema,
  SuggestionParseError,
} from './json-suggestions';

describe('parseSuggestionReply', () => {
  it("carries the model's objection back with an empty list", () => {
    const reply = parseSuggestionReply({
      suggestions: [],
      problem: 'This searches Mastodon, not Google.',
    });

    expect(reply.suggestions).toEqual([]);
    expect(reply.problem).toBe('This searches Mastodon, not Google.');
  });

  it('accepts an objection with no suggestions key at all', () => {
    expect(parseSuggestionReply({ problem: 'Too vague to guess at.' })).toEqual({
      suggestions: [],
      problem: 'Too vague to guess at.',
    });
  });

  it('treats the empty problem of a successful reply as no objection', () => {
    // The happy path sends `problem: ""` on every call, because the schema
    // requires the field. It must never render as an objection.
    expect(parseSuggestionReply({ suggestions: ['a'], problem: '   ' })).toEqual({
      suggestions: ['a'],
      problem: null,
    });
  });

  it('reads the objection from the other names models reach for', () => {
    expect(parseSuggestionReply({ suggestions: [], error: 'Not a search.' }).problem).toBe(
      'Not a search.',
    );
  });

  it('truncates an objection that turned into an essay', () => {
    const long = 'x'.repeat(900);
    expect(parseSuggestionReply({ problem: long }).problem).toHaveLength(400);
  });

  it('still refuses a reply that is neither a list nor an objection', () => {
    expect(() => parseSuggestionReply({ mood: 'unhelpful' })).toThrow(SuggestionParseError);
  });
});

describe('parseSuggestions', () => {
  it('takes the object structured output gives us', () => {
    expect(parseSuggestions({ suggestions: ['+rust +compiler', 'from:@a@b'] })).toEqual([
      '+rust +compiler',
      'from:@a@b',
    ]);
  });

  it('parses a JSON string, for transports that stringify it', () => {
    expect(parseSuggestions('{"suggestions":["a","b"]}')).toEqual(['a', 'b']);
  });

  it('digs the object out of a ```json fence', () => {
    const reply = 'Here you go:\n```json\n{"suggestions":["a","b"]}\n```\nHope that helps!';
    expect(parseSuggestions(reply)).toEqual(['a', 'b']);
  });

  it('digs it out of a bare fence', () => {
    expect(parseSuggestions('```\n["a","b"]\n```')).toEqual(['a', 'b']);
  });

  it('finds an object embedded in prose', () => {
    expect(parseSuggestions('Sure! {"suggestions":["a"]} — let me know.')).toEqual(['a']);
  });

  it('accepts a bare array, which is unambiguous enough not to reject', () => {
    expect(parseSuggestions(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('raises the objection as the error, for callers with nowhere to show it', () => {
    // The tag helper takes this path: it cannot render a `problem`, so the
    // sentence is better off inside the error it already displays.
    expect(() => parseSuggestions({ suggestions: [], problem: 'Not a search.' })).toThrow(
      'Not a search.',
    );
  });

  it('accepts a differently-named single array key', () => {
    // Models rename `suggestions` to `tags` or `queries` constantly.
    expect(parseSuggestions({ tags: ['rust', 'compilers'] })).toEqual(['rust', 'compilers']);
  });

  it('refuses an object with two arrays, where the payload is ambiguous', () => {
    expect(() => parseSuggestions({ good: ['a'], bad: ['b'] })).toThrow(SuggestionParseError);
  });

  it('pulls the text out of annotated entries', () => {
    expect(
      parseSuggestions({
        suggestions: [
          { query: '+rust', why: 'narrowest' },
          { query: 'rust', why: 'broad' },
        ],
      }),
    ).toEqual(['+rust', 'rust']);
  });

  it('trims, drops blanks, and dedupes case-insensitively', () => {
    expect(parseSuggestions({ suggestions: ['  Rust ', 'rust', '', '   ', 'Go'] })).toEqual([
      'Rust',
      'Go',
    ]);
  });

  it('caps the list at the requested maximum', () => {
    expect(parseSuggestions({ suggestions: ['a', 'b', 'c', 'd', 'e', 'f'] }, 5)).toHaveLength(5);
  });

  it('rejects prose with no list in it, with an actionable message', () => {
    expect(() => parseSuggestions("I'm afraid I can't help with that.")).toThrow(
      /structured output/i,
    );
  });

  it('rejects an empty list rather than returning nothing useful', () => {
    expect(() => parseSuggestions({ suggestions: [] })).toThrow(/empty list/i);
    expect(() => parseSuggestions({ suggestions: ['', '  '] })).toThrow(/empty list/i);
  });

  it('rejects null, undefined and numbers', () => {
    for (const value of [null, undefined, 42, '']) {
      expect(() => parseSuggestions(value)).toThrow(SuggestionParseError);
    }
  });
});

describe('suggestionSchema', () => {
  it('asks for a strict, closed object so providers can enforce it', () => {
    const schema = suggestionSchema('search_queries', 5);
    expect(schema.name).toBe('search_queries');
    expect(schema.strict).toBe(true);
    expect(schema.schema.additionalProperties).toBe(false);
    expect(schema.schema.properties.suggestions.items).toEqual({ type: 'string' });
    // `problem` is required, not optional: `strict: true` means every property
    // must be listed, and a plain always-present string is the shape every
    // provider honours.
    expect(schema.schema.required).toEqual(['suggestions', 'problem']);
    expect(schema.schema.properties.problem.type).toBe('string');
  });
});
