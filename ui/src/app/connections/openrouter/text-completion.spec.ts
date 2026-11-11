import { describe, expect, it } from 'vitest';
import { cleanTextCompletion, MAX_LENGTH_RATIO, TextCompletionError } from './text-completion';

describe('cleanTextCompletion', () => {
  it('passes clean prose through untouched', () => {
    expect(cleanTextCompletion('The cat sat on the mat.')).toBe('The cat sat on the mat.');
  });

  it('trims surrounding whitespace', () => {
    expect(cleanTextCompletion('  hello  ')).toBe('hello');
  });

  describe('preambles', () => {
    it('drops the "Sure! Here is the translation:" opener', () => {
      expect(cleanTextCompletion("Sure! Here's the translation:\nThe cat sat.")).toBe(
        'The cat sat.',
      );
    });

    it('handles the other openers models reach for', () => {
      expect(cleanTextCompletion('Certainly, here it is:\nHola.')).toBe('Hola.');
      expect(cleanTextCompletion('Of course! Translation:\nHola.')).toBe('Hola.');
    });

    it('keeps a legitimate first line that merely ends in a colon', () => {
      // The heuristic must not eat real content. This is a translated post whose
      // first line is a label.
      const reply = 'Ingredients:\nflour, water, salt';
      expect(cleanTextCompletion(reply)).toBe(reply);
    });

    it('keeps a one-line reply that ends in a colon', () => {
      expect(cleanTextCompletion('Here is the thing:')).toBe('Here is the thing:');
    });
  });

  describe('wrapping', () => {
    it('unwraps quotes the model put around the whole answer', () => {
      expect(cleanTextCompletion('"The cat sat."')).toBe('The cat sat.');
      expect(cleanTextCompletion('“The cat sat.”')).toBe('The cat sat.');
    });

    it('leaves a reply that legitimately contains a quotation alone', () => {
      const reply = 'She said "hello" and left.';
      expect(cleanTextCompletion(reply)).toBe(reply);
    });

    it('unwraps a code fence the model wrapped prose in', () => {
      expect(cleanTextCompletion('```\nThe cat sat.\n```')).toBe('The cat sat.');
      expect(cleanTextCompletion('```text\nThe cat sat.\n```')).toBe('The cat sat.');
    });
  });

  describe('refusals', () => {
    it('rejects an empty or whitespace reply', () => {
      expect(() => cleanTextCompletion('')).toThrow(TextCompletionError);
      expect(() => cleanTextCompletion('   \n  ')).toThrow(TextCompletionError);
    });

    it('rejects a non-string reply', () => {
      for (const value of [null, undefined, 42, { content: 'hi' }]) {
        expect(() => cleanTextCompletion(value)).toThrow(TextCompletionError);
      }
    });

    it('returns a bare preamble verbatim rather than guessing it was meant to be empty', () => {
      // "Sure! Here it is:" with nothing after it trims to a single line, which is
      // indistinguishable from a legitimate one-line reply ending in a colon (see
      // the test above). Stripping it would need a heuristic that also eats real
      // content, and the cost of not stripping is a visibly useless translation the
      // user can retry — much cheaper than silently deleting someone's post body.
      expect(cleanTextCompletion('Sure! Here it is:\n   ')).toBe('Sure! Here it is:');
    });

    it('rejects an answer far longer than the post — the model replied instead', () => {
      const source = 'x'.repeat(100);
      const essay = 'y'.repeat(100 * MAX_LENGTH_RATIO + 1);

      expect(() => cleanTextCompletion(essay, { source })).toThrow(/answered the post/i);
    });

    it('allows the inflation real language pairs produce', () => {
      const source = 'x'.repeat(100);
      const longer = 'y'.repeat(250);

      expect(cleanTextCompletion(longer, { source })).toBe(longer);
    });

    it('skips the ratio check for short posts, where it means nothing', () => {
      // "hi" legitimately becoming a longer greeting must not be an error.
      const long = 'a much longer greeting than the original, quite reasonably';
      expect(cleanTextCompletion(long, { source: 'hi' })).toBe(long);
    });

    it('skips the ratio check when no source was given', () => {
      expect(cleanTextCompletion('y'.repeat(5000))).toHaveLength(5000);
    });
  });

  it('returns HTML-looking output as literal text, never as markup', () => {
    // The guard does not sanitize, because the render site must treat this as text.
    // This test documents that contract: what goes in comes out verbatim, so a
    // renderer that innerHTMLs it is the bug.
    const hostile = '<img src=x onerror=alert(1)>';
    expect(cleanTextCompletion(hostile)).toBe(hostile);
  });
});
