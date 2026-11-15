/**
 * Where throwaway output goes: test reports, browser screenshots and Playwright
 * traces outside the tree; gate logs in the ignored repository log/ folder.
 *
 * Root: $MAWKINGBIRD_ARTIFACTS when set (CI or a custom location), otherwise
 * <OS temp>/mawkingbird, e.g. %LOCALAPPDATA%\Temp\mawkingbird on Windows.
 *
 * From a shell, `node ui/scripts/artifacts.mjs logs` creates and prints log/:
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
const logRoot = path.resolve(import.meta.dirname, '../../log');

/** Creates a folder for the requested output kind. */
export function artifactDir(...parts) {
  const directory =
    parts[0] === 'logs'
      ? path.join(logRoot, ...parts.slice(1))
      : path.join(artifactRoot, ...parts);
  mkdirSync(directory, { recursive: true });
  return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(artifactDir(...process.argv.slice(2)).replaceAll('\\', '/'));
}
