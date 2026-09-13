import {
  analyzeLanguage,
  LanguageAnalysis,
  LanguageSegment,
  segmentLanguageText,
} from './language-detect';

/**
 * The DOM boundary stays in the app. A detached template is inert: this content
 * is never inserted into the document and cannot execute scripts or load images.
 * Blockquotes, link labels and hashtags must survive extraction as distinct parts.
 */
export function analyzeStatusLanguage(html: string, spoiler = ''): LanguageAnalysis {
  const limit = 12000;
  const template = document.createElement('template');
  const available = Math.max(0, limit - spoiler.length);
  template.innerHTML = html.slice(0, available);
  const segments: LanguageSegment[] = [];
  if (spoiler) segments.push(...segmentLanguageText(spoiler.slice(0, limit)));
  const blockNames = new Set([
    'P',
    'DIV',
    'LI',
    'UL',
    'OL',
    'SECTION',
    'ARTICLE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
  ]);

  function visit(parent: Node, kind: 'prose' | 'quote'): void {
    let buffer = '';
    const flush = () => {
      for (const segment of segmentLanguageText(buffer)) {
        segments.push({ ...segment, kind: segment.kind === 'prose' ? kind : segment.kind });
      }
      buffer = '';
    };
    function walk(node: Node): void {
      if (node.nodeType === Node.TEXT_NODE) {
        buffer += node.textContent ?? '';
        return;
      }
      if (!(node instanceof Element)) return;
      const name = node.tagName;
      if (['SCRIPT', 'STYLE', 'PRE', 'CODE', 'NOSCRIPT'].includes(name)) {
        buffer += ' ';
        return;
      }
      if (name === 'A') {
        const text = node.textContent ?? '';
        segments.push({
          kind:
            text.trim().startsWith('#') || node.classList.contains('hashtag') ? 'hashtag' : 'link',
          text,
        });
        buffer += ' ';
        return;
      }
      if (name === 'BLOCKQUOTE' || name === 'Q') {
        if (name === 'BLOCKQUOTE') flush();
        else buffer += ' ';
        visit(node, 'quote');
        return;
      }
      if (name === 'BR') {
        flush();
        return;
      }
      const block = blockNames.has(name);
      if (block) flush();
      for (const child of node.childNodes) walk(child);
      if (block) flush();
    }
    for (const child of parent.childNodes) walk(child);
    flush();
  }
  visit(template.content, 'prose');
  return analyzeLanguage(segments, html.length + spoiler.length > limit);
}
