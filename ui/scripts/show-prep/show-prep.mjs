#!/usr/bin/env node
// Show prep CLI (spec/show-prep.md).
//
//   node scripts/show-prep/show-prep.mjs --topic mastodon-clients [--open] [--json]
//     [--fixture file.json] [--app https://mawkingbird.com/canary]
//
// Writes run-sheet.html (open this one), run-sheet.md, run-sheet.json and
// candidates.json under log/show-prep/<topic>-<date>/. --open opens the page.
// --json also prints the sheet to stdout, for an agent driving it from a shell.
// --fixture reads a JSON array of { status, server, tag } instead of the network.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatherTopic } from './gather.mjs';
import { rankCandidates } from './rank.mjs';
import { buildRunSheet, runSheetMarkdown } from './run-sheet.mjs';
import { runSheetHtml } from './run-sheet-html.mjs';
import { execFile } from 'node:child_process';
import { loadTopic } from './topic.mjs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const topicId = arg('topic');
if (!topicId) {
  console.error('Usage: show-prep.mjs --topic <id> [--json] [--fixture file.json]');
  process.exit(2);
}
const pack = loadTopic(topicId);
const fixture = arg('fixture');
const gathered = fixture
  ? { candidates: JSON.parse(readFileSync(fixture, 'utf8')), requests: 0, failures: [] }
  : await gatherTopic(pack);
const now = new Date();
const ranked = rankCandidates(gathered.candidates, pack, now.getTime());
const app = arg('app');
if (app && !/^https:\/\/[^\s]+$/.test(app)) throw new Error('--app must be an https address');
const sheet = buildRunSheet(ranked, pack, gathered, now.toISOString(), app);

// Repository root's log/ folder (never elsewhere in the tree; AGENTS.md).
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = join(root, 'log', 'show-prep', `${pack.id}-${now.toISOString().slice(0, 10)}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'run-sheet.json'), JSON.stringify(sheet, null, 2) + '\n');
writeFileSync(join(out, 'run-sheet.md'), runSheetMarkdown(sheet));
const page = join(out, 'run-sheet.html');
writeFileSync(page, runSheetHtml(sheet));
// The raw candidates, so the ranking can be re-tuned offline with --fixture.
if (!fixture)
  writeFileSync(join(out, 'candidates.json'), JSON.stringify(gathered.candidates) + '\n');
if (process.argv.includes('--json')) console.log(JSON.stringify(sheet, null, 2));
const items = sheet.segments.reduce((n, s) => n + s.items.length, 0);
console.error(
  `${pack.title}: ${gathered.candidates.length} candidates, ${ranked.length} after vetting, ${items} on the sheet, ${gathered.failures.length} failures → ${out}`,
);
// The page in the default browser: Windows (Git Bash), macOS or Linux.
if (process.argv.includes('--open')) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', page]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [page]];
  execFile(command, args, () => undefined);
}
