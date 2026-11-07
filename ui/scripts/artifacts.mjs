/**
 * Where throwaway output goes: test reports, browser screenshots, Playwright
 * traces and gate logs. Never the working tree, so a check run leaves
 * `git status --ignored` as it found it.
 *
 * Root: $MAWKINGBIRD_ARTIFACTS when set (CI or a custom location), otherwise
 * <OS temp>/mawkingbird, e.g. %LOCALAPPDATA%\Temp\mawkingbird on Windows.
 *
 * From a shell, `node ui/scripts/artifacts.mjs logs` creates and prints the
 * logs folder:
 *   L=$(node ui/scripts/artifacts.mjs logs); make test > "$L/test.log" 2>&1
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const artifactRoot = path.resolve(
  process.env.MAWKINGBIRD_ARTIFACTS || path.join(tmpdir(), 'mawkingbird'),
);

/** Creates (if needed) and returns a folder under the artifact root. */
export function artifactDir(...parts) {
  const directory = path.join(artifactRoot, ...parts);
  mkdirSync(directory, { recursive: true });
  return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(artifactDir(...process.argv.slice(2)).replaceAll('\\', '/'));
}
