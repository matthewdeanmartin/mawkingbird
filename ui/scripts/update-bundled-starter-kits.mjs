#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const candidatesPath = join(scriptDirectory, 'starter-kit-candidates.json');
const reportPath = join(scriptDirectory, 'starter-kit-validation.json');
const targetPath = join(scriptDirectory, '..', 'src', 'app', 'bundled-starter-kits.generated.ts');
const candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'));
const checkOnly = process.argv.includes('--check');
const requestTimeoutMs = 15_000;

function splitHandle(handle) {
  const normalized = handle.replace(/^@/, '');
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0 || separator === normalized.length - 1) {
    throw new Error(`Invalid fully-qualified handle: ${handle}`);
  }
  return { username: normalized.slice(0, separator), host: normalized.slice(separator + 1) };
}

async function lookup(handle, migrationsRemaining = 3) {
  const { host } = splitHandle(handle);
  const url = new URL(`https://${host}/api/v1/accounts/lookup`);
  url.searchParams.set('acct', handle.replace(/^@/, ''));
  const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const account = await response.json();
  if (account.moved && migrationsRemaining > 0) {
    const movedHost = new URL(account.moved.url).host;
    const movedHandle = account.moved.acct.includes('@')
      ? account.moved.acct
      : `${account.moved.username}@${movedHost}`;
    return lookup(movedHandle, migrationsRemaining - 1);
  }
  return { account, host };
}

function antiIndexingReasons(account) {
  return [
    ...(account.discoverable === false ? ['discoverable=false'] : []),
    ...(account.indexable === false ? ['indexable=false'] : []),
    ...(account.noindex === true ? ['noindex=true'] : []),
  ];
}

function accountSnapshot(account, host) {
  const acct = account.acct.includes('@') ? account.acct : `${account.username}@${host}`;
  return {
    id: String(account.id),
    username: account.username,
    acct,
    displayName: account.display_name || account.username,
    note: account.note || '',
    url: account.url,
    avatar: account.avatar_static || account.avatar || '',
    followersCount: account.followers_count || 0,
    followingCount: account.following_count || 0,
    statusesCount: account.statuses_count || 0,
    bot: account.bot === true,
    locked: account.locked === true,
    discoverable: account.discoverable ?? null,
    indexable: account.indexable ?? null,
    noindex: account.noindex ?? null,
  };
}

const uniqueHandles = [...new Set(candidates.flatMap((kit) => kit.handles))];
const validations = new Map();
let cursor = 0;

async function worker() {
  while (cursor < uniqueHandles.length) {
    const handle = uniqueHandles[cursor++];
    try {
      const { account, host } = await lookup(handle);
      const antiIndexing = antiIndexingReasons(account);
      validations.set(handle.toLowerCase(), {
        requestedHandle: handle,
        status: antiIndexing.length === 0 ? 'included' : 'excluded',
        antiIndexing,
        account: accountSnapshot(account, host),
      });
    } catch (error) {
      validations.set(handle.toLowerCase(), {
        requestedHandle: handle,
        status: 'unresolved',
        antiIndexing: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));

const kits = candidates.map((kit) => ({
  slug: kit.slug,
  title: kit.title,
  blurb: kit.blurb,
  accounts: kit.handles
    .map((handle) => validations.get(handle.toLowerCase()))
    .filter((validation) => validation.status === 'included')
    .map((validation) => validation.account),
}));

const report = {
  checkedAt: new Date().toISOString(),
  policy: 'Exclude discoverable=false, indexable=false, or noindex=true; include missing fields.',
  kits: candidates.map((kit) => ({
    slug: kit.slug,
    candidates: kit.handles.map((handle) => validations.get(handle.toLowerCase())),
  })),
};

if (checkOnly) {
  const previous = JSON.parse(readFileSync(reportPath, 'utf8'));
  const membership = (value) =>
    value.kits.map((kit) => ({
      slug: kit.slug,
      included: kit.candidates
        .filter((candidate) => candidate.status === 'included')
        .map((candidate) => candidate.account.acct.toLowerCase()),
    }));
  if (JSON.stringify(membership(previous)) !== JSON.stringify(membership(report))) {
    console.error(
      'Bundled starter-kit membership changed. Run npm run starter-kits:update and review the report.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Revalidated ${uniqueHandles.length} unique candidate accounts; shipped membership is unchanged.`,
    );
  }
} else {
  const generated = `// Generated by ui/scripts/update-bundled-starter-kits.mjs — do not hand-edit.
import { Account } from './models';

interface AccountSnapshot {
  id: string;
  username: string;
  acct: string;
  displayName: string;
  note: string;
  url: string;
  avatar: string;
  followersCount: number;
  followingCount: number;
  statusesCount: number;
  bot: boolean;
  locked: boolean;
  discoverable: boolean | null;
  indexable: boolean | null;
  noindex: boolean | null;
}

export interface BundledStarterKit {
  slug: string;
  title: string;
  blurb: string;
  accounts: readonly Account[];
}

function bundledAccount(snapshot: AccountSnapshot): Account {
  return {
    id: snapshot.id,
    username: snapshot.username,
    acct: snapshot.acct,
    display_name: snapshot.displayName,
    note: snapshot.note,
    url: snapshot.url,
    avatar: snapshot.avatar,
    avatar_static: snapshot.avatar,
    header: '',
    header_static: '',
    followers_count: snapshot.followersCount,
    following_count: snapshot.followingCount,
    statuses_count: snapshot.statusesCount,
    bot: snapshot.bot,
    locked: snapshot.locked,
    discoverable: snapshot.discoverable,
    indexable: snapshot.indexable,
    noindex: snapshot.noindex,
    fields: [],
  };
}

const snapshots = ${JSON.stringify(kits, null, 2)};

export const BUNDLED_STARTER_KITS: readonly BundledStarterKit[] = snapshots.map((kit) => ({
  ...kit,
  accounts: kit.accounts.map(bundledAccount),
}));

export function bundledStarterKit(slug: string): BundledStarterKit | null {
  return BUNDLED_STARTER_KITS.find((kit) => kit.slug === slug) ?? null;
}
`;
  writeFileSync(targetPath, generated);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const prettier = join(scriptDirectory, '..', 'node_modules', 'prettier', 'bin', 'prettier.cjs');
  execFileSync(process.execPath, [prettier, '--write', targetPath], { stdio: 'ignore' });
  const included = kits.reduce((sum, kit) => sum + kit.accounts.length, 0);
  const excluded = [...validations.values()].filter((value) => value.status === 'excluded').length;
  const unresolved = [...validations.values()].filter(
    (value) => value.status === 'unresolved',
  ).length;
  console.log(
    `Updated 10 kits with ${included} memberships (${excluded} unique opt-outs, ${unresolved} unique unresolved).`,
  );
  for (const kit of kits)
    console.log(
      `  ${kit.title}: ${kit.accounts.length}/${candidates.find((item) => item.slug === kit.slug).handles.length}`,
    );
}
