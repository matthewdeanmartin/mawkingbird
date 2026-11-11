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
  return settleCjkByScript(
    analyzeLanguage(segments, html.length + spoiler.length > limit),
    segments,
  );
}

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;

/**
 * Settle a Japanese/Chinese/Korean tie by script, which the detector leaves open.
 *
 * Kana are used only by Japanese and Hangul only by Korean, so a note whose
 * candidates are all CJK and which contains either is not ambiguous at all.
 * The case this exists for is everyday Misskey: a kanji-only line ("草",
 * Misskey's "lol") beside a kana line made the whole note "unsure", and the
 * reader was asked "Translate from which language?" over plainly Japanese text
 * (owner report, 2026-11-10). Deliberately narrow: it reads only the author's
 * prose, and only when that prose is undecided, so a note mixing English and
 * Japanese, or Korean prose quoting Japanese, keeps its honest "mixed" answer.
 */
export function settleCjkByScript(
  analysis: LanguageAnalysis,
  segments: readonly LanguageSegment[],
): LanguageAnalysis {
  // Only when the author's own prose is undecided: prose in one language with a
  // quotation in another is genuinely mixed and must stay so.
  if (analysis.language || analysis.prose.language) return analysis;
  const cjk = new Set(['ja', 'zh', 'ko']);
  if (!analysis.candidates.length || !analysis.candidates.every((c) => cjk.has(c))) {
    return analysis;
  }
  const text = segments
    .filter((s) => s.kind === 'prose')
    .map((s) => s.text)
    .join(' ');
  const language =
    KANA.test(text) && analysis.candidates.includes('ja')
      ? 'ja'
      : HANGUL.test(text) && analysis.candidates.includes('ko')
        ? 'ko'
        : null;
  if (!language) return analysis;
  return {
    ...analysis,
    language,
    prose: analysis.prose.language ? analysis.prose : { ...analysis.prose, language },
  };
}
