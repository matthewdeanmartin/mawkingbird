#!/usr/bin/env node
// Propose the /create-mastodon-account/ server list: the biggest general
// servers per language from the joinmastodon.org directory, by active users.
// The owner reviews the diff before committing (spec/new-account-setup.md §
// Server snapshot). Usage: node scripts/refresh-signup-servers.mjs [--write]
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../src/app/public-pages/create-account/signup-servers.json', import.meta.url);
const API = 'https://api.joinmastodon.org/servers';
const LANGUAGES = [
  'en',
  'de',
  'fr',
  'es',
  'ja',
  'it',
  'nl',
  'pt',
  'pl',
  'sv',
  'fi',
  'da',
  'no',
  'cs',
  'ca',
  'eu',
  'gl',
  'ko',
  'zh',
  'ru',
  'uk',
  'tr',
  'el',
  'ar',
  'th',
  'id',
  'vi',
  'hu',
  'ro',
];
/** Open servers shown per language, plus approval-required ones behind the chooser's toggle. */
const OPEN_PER_LANGUAGE = 5;
const APPROVAL_PER_LANGUAGE = 3;

const summary = (text) => {
  const first = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first;
};

async function fetchLanguage(lang) {
  const url = `${API}?language=${lang}&category=general`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const servers = await response.json();
  return servers
    .sort((a, b) => (b.last_week_users ?? 0) - (a.last_week_users ?? 0))
    .filter(
      (s, _i, all) =>
        all
          .filter((t) => (t.approval_required === true) === (s.approval_required === true))
          .indexOf(s) < (s.approval_required ? APPROVAL_PER_LANGUAGE : OPEN_PER_LANGUAGE),
    )
    .map((s) => ({
      domain: s.domain,
      description: summary(s.description),
      lastWeekUsers: s.last_week_users ?? 0,
      approvalRequired: s.approval_required === true,
      version: s.version ?? '',
    }));
}

const languages = {};
for (const lang of LANGUAGES) {
  const servers = await fetchLanguage(lang);
  if (servers.some((s) => !s.approvalRequired)) languages[lang] = servers;
}
const next = { checkedOn: new Date().toISOString().slice(0, 10), languages };

let previous = { languages: {} };
try {
  previous = JSON.parse(await readFile(OUT, 'utf8'));
} catch {
  // First run.
}
for (const lang of new Set([...Object.keys(previous.languages), ...Object.keys(languages)])) {
  const before = (previous.languages[lang] ?? []).map((s) => s.domain).join(', ');
  const after = (languages[lang] ?? []).map((s) => s.domain).join(', ');
  if (before !== after) console.log(`${lang}: ${before || '(none)'} -> ${after || '(dropped)'}`);
}
if (process.argv.includes('--write')) {
  await writeFile(OUT, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(languages).length} languages. Review before committing.`);
} else {
  console.log('Dry run. Pass --write to save.');
}
