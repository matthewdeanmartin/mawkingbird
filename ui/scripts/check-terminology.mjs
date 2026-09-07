/**
 * Fail the build when a template hardcodes a word the user can rename.
 *
 * "Some things are called reblogs when the setting says Tweets" is a class of
 * bug, not an instance. `src/app/terminology.ts` lets a reader pick posts /
 * tweets / florps, and the visible buttons were already routed through it — it
 * was the strings nobody re-reads that were wrong: `aria-label`, `title`, and
 * `sr-only` text. Sweeping them once fixed the day this was written; this
 * script fixes the next component to ship with `aria-label="3 boosts"`.
 *
 * It lives here rather than in a vitest spec because the Angular test build has
 * no Node types and no filesystem access — the same reason
 * `check-storage-registry.mjs` is a script.
 *
 * Run: `npm run check:terminology`
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(ROOT, 'src', 'app');

/** Words that must come from `words()` when they are shown to a person. */
const NOUNS = ['posts', 'post', 'boosts', 'boost', 'reposts', 'repost', 'reblogs', 'reblog'];

/**
 * Lines exempted from the rule.
 *
 * Kept deliberately short: an entry belongs here only when the word is *not*
 * the reader's vocabulary — most obviously the settings control that names the
 * vocabularies themselves, which must not follow the setting it sets.
 */
const ALLOWED = [
  {
    file: 'pages/settings/blue/blue-controls.html',
    contains: 'Posts &amp; boosts (Mastodon)',
    why: 'Names the vocabulary options themselves.',
  },
  {
    file: 'pages/settings/blue/blue-controls.html',
    contains: 'Tweets &amp; retweets (like the bird site)',
    why: 'Names the vocabulary options themselves.',
  },
  {
    file: 'pages/settings/blue/blue-controls.html',
    contains: "Florps &amp; reflorps (nobody else's word)",
    why: 'Names the vocabulary options themselves.',
  },
];

/**
 * Where a banned noun counts as display text.
 *
 * Deliberately *not* matched: API field names (`reblogs_count`), CSS classes,
 * route paths, tab keys (`tab() === 'posts'`) and anything sent to a server.
 * Those are protocol rather than vocabulary, and renaming them would break the
 * wire format while fixing nothing a reader can see.
 */
function violations(line) {
  const nouns = NOUNS.join('|');
  const patterns = [
    // `{{ count }} boosts` — a count followed by its noun.
    new RegExp(`\\}\\}\\s*(${nouns})\\b`, 'i'),
    // `<span class="sr-only">reposts</span>`
    new RegExp(`sr-only"[^>]*>\\s*(${nouns})\\b`, 'i'),
    // A *static* title / aria-label. A bound one (`[title]="…"`) is an
    // expression, which is where the correct `words()` calls already live.
    new RegExp(`(?<!\\])(?:aria-label|title)="[^"]*\\b(${nouns})\\b[^"]*"`, 'i'),
    // `expression + ' boosts'` — a noun glued onto a count inside a binding.
    new RegExp(`\\+\\s*['"]\\s*(${nouns})\\b`, 'i'),
    // A ternary picking singular/plural for display: `? 'post' : 'posts'`.
    new RegExp(`\\?\\s*['"](${nouns})['"]\\s*:`, 'i'),
  ];
  return patterns.some((pattern) => pattern.test(line));
}

function templates(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...templates(full));
    } else if (entry.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const offenders = [];
for (const file of templates(APP_DIR)) {
  const rel = relative(APP_DIR, file).replace(/\\/g, '/');
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (!violations(line)) {
        return;
      }
      const exempt = ALLOWED.some((entry) => entry.file === rel && line.includes(entry.contains));
      if (!exempt) {
        offenders.push(`${rel}:${index + 1}  ${line.trim()}`);
      }
    });
}

if (offenders.length > 0) {
  console.error('\nTemplates hardcode a word the reader can rename:\n');
  for (const offender of offenders) {
    console.error(`  - ${offender}`);
  }
  console.error(
    '\nUse {{ words().Posts }} / {{ words().Boosts }} (inject Terminology), or bind the\n' +
      'attribute: [title]="words().Boost". If the word genuinely isn\'t the reader\'s\n' +
      'vocabulary, add a justified entry to ALLOWED in scripts/check-terminology.mjs.\n',
  );
  process.exit(1);
}

console.log('Terminology OK — no template hardcodes a renameable word.');
