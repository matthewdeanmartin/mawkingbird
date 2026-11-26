#!/usr/bin/env node
// Show prep CLI (spec/show-prep.md; runbook: ops/podcast_topic_finder.md).
//
//   node scripts/show-prep/show-prep.mjs --topic mastodon-clients [--open] [--json]
//     [--fixture candidates.json] [--app https://mawkingbird.com/canary] [--seed user@host,…]
//
// Writes run-sheet.html (open this one), run-sheet.md, run-sheet.json and, for a
// live run, candidates.json under log/show-prep/<topic>-<date>/.
// --json prints the sheet to stdout, for an agent driving it from a shell.
// --fixture re-ranks a saved candidates.json instead of using the network.
// For a conversation with an agent instead, see mcp-server.mjs.
import { execFile } from 'node:child_process';
import { ShowPrepSession } from './session.mjs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const topicId = arg('topic');
if (!topicId) {
  console.error(
    'Usage: show-prep.mjs --topic <id> [--open] [--json] [--fixture file.json] [--app https://…]',
  );
  process.exit(2);
}
const app = arg('app');
if (app && !/^https:\/\/\S+$/.test(app)) throw new Error('--app must be an https address');

const session = ShowPrepSession.forTopic(topicId);
// --seed a@b,c@d: read these accounts too, for this run only.
const seeds = arg('seed');
if (seeds)
  session.pack.seedAccounts = [
    ...session.pack.seedAccounts,
    ...seeds
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
  ];
const fixture = arg('fixture');
if (fixture) session.loadCandidates(fixture);
else await session.gather();

const written = session.write({ app });
if (process.argv.includes('--json')) console.log(JSON.stringify(session.sheet(app), null, 2));
const summary = session.summary();
console.error(
  `${session.pack.title}: ${summary.candidates} candidates, ${summary.shortlisted} after vetting, ${written.items} on the sheet, ${summary.failures.length} failures → ${written.out}`,
);

// The page in the default browser: Windows (Git Bash), macOS or Linux.
if (process.argv.includes('--open')) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', written.page]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [written.page]];
  execFile(command, args, () => undefined);
}
