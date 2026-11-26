// Run sheet as a page (spec/show-prep.md): the spec library's own template and
// stylesheet, inlined so the file opens straight from disk, plus a little CSS and
// script for using it on air (tick what was shown, hide flagged items).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'spec');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Only http(s) links reach the page; anything else becomes inert. */
export function safeHref(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '#';
  } catch {
    return '#';
  }
}

const EXTRA_CSS = `
.sheet-tools { display: flex; flex-wrap: wrap; gap: 16px; margin: 8px 0 28px; font-size: 14px; }
.segment { margin-top: 40px; }
.item { position: relative; margin: 14px 0; padding: 18px 20px 16px; border: 1px solid var(--line); border-radius: 10px; background: #fafbf6; }
.item.review { border-color: #d6b35a; }
.item.shown { opacity: .45; }
.item h3 { margin: 0 0 4px; font-size: 16px; line-height: 1.4; }
.item .meta { margin: 0; color: var(--muted); font-size: 13px; }
.item blockquote { margin: 10px 0; }
.item .flag { display: inline-block; margin: 2px 0 8px; padding: 2px 10px; border-radius: 20px; background: #fbf1d6; color: #6a5212; font-size: 12px; }
.item .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; }
.item .open { padding: 6px 14px; border-radius: 20px; background: var(--accent); color: #fff; text-decoration: none; font-weight: 650; }
.item label { margin-left: auto; color: var(--muted); }
body.hide-shown .item.shown, body.hide-review .item.review { display: none; }
.failures { font-size: 13px; color: var(--muted); }
.media { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 12px; }
.media a { position: relative; display: block; }
.media img { display: block; max-height: 180px; max-width: 320px; border-radius: 8px; border: 1px solid var(--line); object-fit: cover; }
.media span { position: absolute; left: 6px; bottom: 6px; padding: 1px 8px; border-radius: 10px; background: #000a; color: #fff; font-size: 11px; }
`;

// Ticks are kept per sheet in this browser only; the page works without them.
const SCRIPT = `
(() => {
  const key = 'show-prep:' + document.body.dataset.sheet;
  let shown = {};
  try { shown = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
  for (const box of document.querySelectorAll('.item input[type=checkbox]')) {
    const item = box.closest('.item');
    box.checked = !!shown[box.dataset.id];
    item.classList.toggle('shown', box.checked);
    box.addEventListener('change', () => {
      shown[box.dataset.id] = box.checked;
      item.classList.toggle('shown', box.checked);
      try { localStorage.setItem(key, JSON.stringify(shown)); } catch {}
    });
  }
  for (const toggle of document.querySelectorAll('.sheet-tools input')) {
    toggle.addEventListener('change', () => document.body.classList.toggle(toggle.value, toggle.checked));
  }
})();
`;

/** Thumbnails that open the full image; a video or audio shows its poster with a label. */
function media(list = []) {
  if (!list.length) return '';
  return `<div class="media">${list
    .map((m) => {
      const label =
        m.type === 'image' || m.type === 'gifv' ? '' : `<span>${escapeHtml(m.type)}</span>`;
      const preview = safeHref(m.preview);
      return `<a href="${escapeHtml(safeHref(m.url))}" target="_blank" rel="noopener noreferrer">${
        preview === '#'
          ? escapeHtml(m.type)
          : `<img src="${escapeHtml(preview)}" alt="${escapeHtml(m.alt)}" title="${escapeHtml(m.alt)}" loading="lazy" referrerpolicy="no-referrer">`
      }${label}</a>`;
    })
    .join('')}</div>`;
}

function item(entry, index) {
  const id = escapeHtml(entry.url);
  const flag =
    entry.verdict === 'review'
      ? `<p class="flag">Look first: ${escapeHtml(entry.reasons.join('; '))}</p>`
      : '';
  return `<article class="item ${entry.verdict}">
  <h3>${index + 1}. ${escapeHtml(entry.author)}</h3>
  <p class="meta">@${escapeHtml(entry.acct)} · ${escapeHtml(entry.created_at.slice(0, 10))} · ${entry.favourites} likes · ${entry.boosts} boosts · ${entry.replies} replies</p>
  <blockquote>${escapeHtml(entry.excerpt)}</blockquote>
  ${media(entry.media)}
  ${flag}
  <p class="actions">
    <a class="open" href="${escapeHtml(safeHref(entry.app ?? entry.url))}" target="_blank" rel="noopener">Open in Mawkingbird</a>
    <a href="${escapeHtml(safeHref(entry.url))}" target="_blank" rel="noopener noreferrer">Original</a>
    <label><input type="checkbox" data-id="${id}"> Shown</label>
  </p>
</article>`;
}

/**
 * @param {ReturnType<import('./run-sheet.mjs').buildRunSheet>} sheet
 * @param {{ template?: string, css?: string }} [assets] For tests; defaults to spec/.
 */
export function runSheetHtml(sheet, assets = {}) {
  const template = assets.template ?? readFileSync(join(SPEC, 'template.html'), 'utf8');
  const css = (assets.css ?? readFileSync(join(SPEC, 'style.css'), 'utf8')) + EXTRA_CSS;
  const count = sheet.segments.reduce((n, s) => n + s.items.length, 0);
  const toc = `<ul>${sheet.segments
    .map(
      (s) =>
        `<li><a href="#${escapeHtml(s.id)}">${escapeHtml(s.title)}</a> (${s.items.length})</li>`,
    )
    .join('')}</ul>`;
  const failures = sheet.failures.length
    ? `<details class="failures"><summary>Could not read ${sheet.failures.length}</summary><ul>${sheet.failures
        .map((f) => `<li>${escapeHtml(f)}</li>`)
        .join('')}</ul></details>`
    : '';
  const segments = sheet.segments
    .map(
      (s) => `<section class="segment" id="${escapeHtml(s.id)}">
<h2>${escapeHtml(s.title)}</h2>
${s.items.map(item).join('\n')}
</section>`,
    )
    .join('\n');
  const content = `<h1>What's cool on Mastodon: ${escapeHtml(sheet.title)}</h1>
<p>${escapeHtml(sheet.blurb)}</p>
<p class="document-meta">Pre-vetted only: look at each item before it goes on screen. Open items in Mawkingbird with screen share mode on.</p>
<div class="sheet-tools">
  <label><input type="checkbox" value="hide-shown"> Hide shown</label>
  <label><input type="checkbox" value="hide-review"> Hide flagged</label>
</div>
${failures}
${segments || '<p>Nothing passed vetting. Widen the window or add hashtags to the pack.</p>'}`;
  const fill = {
    title: escapeHtml(`Show prep: ${sheet.title}`),
    content,
    toc,
    toc_label: '<p class="eyebrow">SEGMENTS</p>',
    meta: escapeHtml(
      `${count} items · generated ${sheet.generatedAt} · ${sheet.requests ? `${sheet.requests} public requests` : 'from saved candidates'}`,
    ),
    page_class: 'document',
    root: '.',
  };
  return (
    template
      .replace(/\$(\w+)/g, (match, name) => (name in fill ? fill[name] : match))
      // The spec library's chrome points at its own pages; this file stands alone.
      .replace(/<link rel="stylesheet" href="[^"]*">/, () => `<style>${css}</style>`)
      .replace(/<a class="back" href="[^"]*">[^<]*<\/a>/, '')
      .replace(/<a href="\.\/index\.html">/, '<a>')
      .replace('SPEC LIBRARY', 'SHOW PREP')
      .replace(
        /<body class="([^"]*)">/,
        (_, cls) =>
          `<body class="${cls}" data-sheet="${escapeHtml(sheet.topic + '@' + sheet.generatedAt)}">`,
      )
      .replace('</body>', () => `<script>${SCRIPT}</script>\n</body>`)
  );
}
