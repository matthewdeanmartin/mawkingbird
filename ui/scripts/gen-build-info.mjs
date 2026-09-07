#!/usr/bin/env node
// Overwrite ui/src/app/build-info.ts with real build metadata. CI runs this
// right before building (see .github/workflows/mockingbird-pages.yml); it is
// deliberately not wired into any npm script so local builds keep the
// checked-in placeholder and working trees stay clean.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const repo = process.env.GITHUB_REPOSITORY ?? 'matthewdeanmartin/mawkingbird';
const runId = process.env.GITHUB_RUN_ID;

const info = {
  builtAt: new Date().toISOString(),
  commit: sha,
  commitUrl: `${server}/${repo}/commit/${sha}`,
  runUrl: runId ? `${server}/${repo}/actions/runs/${runId}` : null,
};

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app', 'build-info.ts');
writeFileSync(
  target,
  `// Stamped by ui/scripts/gen-build-info.mjs — build artifact, do not commit.
export interface BuildInfo {
  builtAt: string | null;
  commit: string | null;
  commitUrl: string | null;
  runUrl: string | null;
}

export const BUILD_INFO: BuildInfo = ${JSON.stringify(info, null, 2)};
`,
);
console.log(`Stamped ${target}:`, info);
