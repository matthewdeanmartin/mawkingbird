const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Post HTML as plain text: tags dropped, entities decoded, URLs removed. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
      if (body[0] === '#') {
        const code =
          body[1] === 'x' || body[1] === 'X'
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }
      return ENTITIES[body.toLowerCase()] ?? entity;
    })
    .replace(/https?:\/\/\S+/g, ' ');
}

/**
 * Whether a post asks a human question: a word followed by a question mark
 * that ends the text or a phrase. A port of MIMB's `has_human_question`
 * (`inspect_post.py`), widened to non-Latin letters and the full-width `？`.
 * URLs are removed first, so `?utm=…` in a link never counts.
 */
export function hasHumanQuestion(html: string): boolean {
  const text = plainText(html);
  return /[\p{L}\p{N}_’'](?:\?(?=\s|$)|？)/u.test(text);
}
