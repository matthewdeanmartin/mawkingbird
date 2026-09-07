/**
 * Fail the build when a localStorage key is not classified in the storage
 * registry.
 *
 * Settings export is aimed at publishing a setup to a public gist, so "is this
 * key safe to write to a file?" has to be answered for every key that exists —
 * not just the ones someone remembered. `src/app/storage-registry.ts` refuses
 * to export anything it does not recognise, which makes forgetting a key safe
 * but silent: the key just never gets exported, including keys that *should*
 * be. This script is the other half, turning the omission into a build failure.
 *
 * It lives here rather than in a vitest spec because the Angular test build has
 * no Node types and no filesystem access.
 *
 * Run: `npm run check:storage`
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(ROOT, 'src', 'app');
const REGISTRY = join(APP_DIR, 'storage-registry.ts');

/**
 * Keys that no longer exist in the source but stay classified so that data
 * lingering in a real browser is still recognised (and still excluded).
 */
const LEGACY_KEYS = new Set(['mockingbird_raindrop_credentials']);

/** Every non-spec .ts file under src/app. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Declarations that carry a `mockingbird_*` name but are **not** localStorage
 * keys, matched on the declared constant's name.
 *
 * The only member today is `DB_NAME` in `rss-cache.ts`, which names an
 * *IndexedDB database*. It was reported as an unclassified storage key for as
 * long as this script ran, and it can never be classified, because the registry
 * describes `localStorage` and `sessionStorage` and this is neither.
 *
 * Matching on the constant's name rather than its value is the point: it is the
 * name that says what the string is for. A new IndexedDB store should be called
 * `DB_NAME` and be skipped automatically; a genuine key called something
 * unusual still gets checked.
 */
const NON_STORAGE_DECLARATIONS = /^(?:DB_NAME|DATABASE_NAME|CACHE_NAME|STORE_NAME)$/;

/**
 * Storage keys declared in the source, as `base -> file`.
 *
 * Every key in this app is declared as a `const NAME = '<literal>'` so it can
 * be account-scoped before use, so matching the declaration is a reliable proxy
 * — and it avoids matching the same literals where they appear in comments or
 * in the registry's own notes.
 */
function declaredKeys() {
  const found = new Map();
  const declaration =
    /(?:const|readonly)\s+(\w+)\s*(?::\s*string\s*)?=\s*'((?:mastodon_mock|mockingbird)[._][a-z0-9._:-]+)'/g;
  for (const file of sourceFiles(APP_DIR)) {
    if (file === REGISTRY) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(declaration)) {
      const [, name, key] = match;
      // A trailing `_` or `.` marks a key *prefix* used to match a family of
      // keys (ANONYMOUS_PREFIX), not a key base. A trailing `:` is different:
      // that is how instance-suffixed keys are built, so the literal really is
      // the registered base.
      if (/[._]$/.test(key)) continue;
      if (NON_STORAGE_DECLARATIONS.test(name)) continue;
      found.set(key, relative(ROOT, file).replaceAll('\\', '/'));
    }
  }
  return found;
}

/**
 * Key bases listed in the registry, with their sensitivity.
 *
 * ## Why this is not one regex over the whole file
 *
 * It used to be, and it silently under-reported. The pattern required
 * `sensitivity` on the line immediately after `suffix`, so any entry with an
 * explanatory comment between its fields became invisible — and an invisible
 * entry is then reported as an *unclassified key*, which is the opposite of the
 * truth. Three `mockingbird_blogger_*` entries sat like that, correctly
 * classified and reported as errors, while the tool claimed to have checked
 * them.
 *
 * That is the worst failure mode a checker like this can have: a registry entry
 * can be present and correct, and the guard both ignores it *and* accuses it.
 * Adding a comment to explain a subtle classification — exactly what the
 * registry asks contributors to do — was enough to trigger it.
 *
 * So each entry is now located by its `base:` line and read within its own
 * block, with fields found independently. Comments, blank lines and field
 * reordering are all fine; only a missing field is an error, and it is reported
 * rather than silently skipped.
 */
function registeredKeys() {
  const text = readFileSync(REGISTRY, 'utf8');
  const found = new Map();
  const malformed = [];

  // Split on the closing brace of each array element. Tolerates CRLF, because
  // this repo is developed on Windows and a \n-only pattern silently matches
  // nothing there — the same class of bug as the one above.
  const blocks = text.split(/\r?\n\s*\},?\r?\n/);

  for (const block of blocks) {
    const base = /^\s*base:\s*'([^']+)'/m.exec(block);
    if (!base) continue;

    const sensitivity = /^\s*sensitivity:\s*'([^']+)'/m.exec(block);
    const storage = /^\s*storage:\s*'(local|session)'/m.exec(block);
    const suffix = /^\s*suffix:\s*'(none|account|instance)'/m.exec(block);

    if (!sensitivity || !storage || !suffix) {
      const missing = [
        !storage && 'storage',
        !suffix && 'suffix',
        !sensitivity && 'sensitivity',
      ].filter(Boolean);
      malformed.push(`'${base[1]}' is missing ${missing.join(', ')}`);
      continue;
    }
    found.set(base[1], sensitivity[1]);
  }

  return { found, malformed };
}

/**
 * Every `base:` line in the registry, however the entry is formatted.
 *
 * A deliberately dumb count, used only to cross-check the parser above. If the
 * two disagree, the parser is dropping entries and every result it produced is
 * suspect — so that is reported as a tool failure rather than as a finding
 * about the code being checked.
 */
function rawBaseCount() {
  return [...readFileSync(REGISTRY, 'utf8').matchAll(/^\s*base:\s*'/gm)].length;
}

const declared = declaredKeys();
const { found: registered, malformed } = registeredKeys();
const problems = [];

if (registered.size === 0) {
  problems.push(
    'Could not parse any entries out of storage-registry.ts — has STORAGE_KEYS changed shape?',
  );
}

for (const entry of malformed) {
  problems.push(`Registry entry ${entry} — every entry needs all four fields.`);
}

/*
 * The parser must see every entry that exists.
 *
 * Reported separately from the findings below, and worded as a tool failure,
 * because a parser that drops entries produces confident nonsense: a dropped
 * entry is reported as an unclassified key, so the output accuses the one file
 * that got it right. Checking this is cheap and it is the only thing standing
 * between a formatting change and a guard that quietly stops guarding.
 */
const rawCount = rawBaseCount();
if (registered.size + malformed.length !== rawCount) {
  problems.push(
    `This checker parsed ${registered.size + malformed.length} registry entries but the file ` +
      `contains ${rawCount} 'base:' lines. The parser in this script is dropping entries, so ` +
      `every result below is unreliable. Fix registeredKeys() before trusting this output.`,
  );
}

for (const [base, file] of declared) {
  if (!registered.has(base)) {
    problems.push(`Unclassified storage key '${base}' declared in ${file}`);
  }
}

for (const base of registered.keys()) {
  if (!declared.has(base) && !LEGACY_KEYS.has(base)) {
    problems.push(
      `Registry lists '${base}' but no source file declares it — remove it, or add it to LEGACY_KEYS.`,
    );
  }
}

if (problems.length > 0) {
  console.error('\nStorage registry is out of date:\n');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error(
    '\nEvery localStorage key must be classified in src/app/storage-registry.ts so that\n' +
      'settings export can never publish something it should not. See docs/security.md.\n',
  );
  process.exit(1);
}

console.log(`Storage registry OK — ${registered.size} keys classified.`);
