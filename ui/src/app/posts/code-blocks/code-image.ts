/**
 * Draw code as a PNG, entirely in the browser.
 *
 * Text is drawn token by token onto a canvas rather than screenshotting the
 * page: that works the same in every browser (an SVG `foreignObject` capture
 * taints the canvas in Safari), and nothing leaves the device. Colours are read
 * from the app's own `--code-*` tokens, so the image matches the light or dark
 * theme the writer is using.
 */
import type { CodeToken } from './code-highlight';
import { languageLabel } from './code-fences';

/** Mastodon's default limit for an image description. */
export const ALT_TEXT_LIMIT = 1500;
/** Longest code the image is drawn for; beyond this a paste is the better tool. */
export const MAX_IMAGE_LINES = 200;

const FONT_PX = 15;
const LINE_PX = 22;
const PAD_PX = 24;
const HEADER_PX = 26;
const MAX_WIDTH_PX = 1600;
const SCALE = 2;
const FONT = `${FONT_PX * SCALE}px ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`;

const SCOPE_TOKEN: Record<string, string> = {
  keyword: '--code-keyword',
  built_in: '--code-keyword',
  literal: '--code-keyword',
  'selector-tag': '--code-keyword',
  string: '--code-string',
  regexp: '--code-string',
  attr: '--code-string',
  symbol: '--code-string',
  number: '--code-number',
  variable: '--code-number',
  'template-variable': '--code-number',
  comment: '--code-comment',
  quote: '--code-comment',
  title: '--code-title',
  section: '--code-title',
  type: '--code-title',
  name: '--code-title',
  meta: '--code-meta',
  tag: '--code-meta',
  params: '--code-meta',
};

function themeColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Highlight `code` and draw it; resolves to a PNG blob. */
export async function renderCodeImage(code: string, language: string): Promise<Blob> {
  const { tokenizeLines } = await import('./code-highlight');
  const lines = tokenizeLines(code.replace(/\t/g, '    '), language).slice(0, MAX_IMAGE_LINES);
  return drawLines(lines, languageLabel(language));
}

/** Draw already-tokenised lines. Exported for tests. */
export function drawLines(lines: CodeToken[][], label: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is not available in this browser.'));
  ctx.font = FONT;
  const widest = Math.max(
    0,
    ...lines.map((line) => ctx.measureText(line.map((t) => t.text).join('')).width / SCALE),
  );
  const width = Math.min(MAX_WIDTH_PX, Math.ceil(widest) + PAD_PX * 2);
  const height = HEADER_PX + PAD_PX + Math.max(1, lines.length) * LINE_PX + PAD_PX / 2;
  canvas.width = Math.max(320, width) * SCALE;
  canvas.height = height * SCALE;

  const text = themeColor('--text', '#14171a');
  ctx.fillStyle = themeColor('--code-bg', '#f6f8fa');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  if (label) {
    ctx.fillStyle = themeColor('--code-comment', '#57606a');
    ctx.fillText(label, PAD_PX * SCALE, (PAD_PX / 2) * SCALE);
  }
  lines.forEach((line, row) => {
    let x = PAD_PX * SCALE;
    const y = (HEADER_PX + PAD_PX / 2 + row * LINE_PX) * SCALE;
    for (const token of line) {
      ctx.fillStyle = SCOPE_TOKEN[token.scope] ? themeColor(SCOPE_TOKEN[token.scope], text) : text;
      ctx.fillText(token.text, x, y);
      x += ctx.measureText(token.text).width;
    }
  });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be made.'))),
      'image/png',
    ),
  );
}
