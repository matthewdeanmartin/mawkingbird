import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkExtensionProtocol } from './check-extension-protocol.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (file) => readFileSync(path.join(repo, file), 'utf8');
/** The real files, with one replaced. */
const withChange = (file, from, to) => (name) => {
  const text = real(name);
  if (name !== file) return text;
  assert.ok(text.includes(from), `${file} no longer contains ${from}`);
  return text.replace(from, to);
};

test('the repository is in step', () => {
  assert.deepEqual(checkExtensionProtocol(real), []);
});

test('catches the app expecting a bridge version the record does not', () => {
  const problems = checkExtensionProtocol(
    withChange(
      'ui/src/app/platform/extension/extension-bridge.ts',
      'EXTENSION_BRIDGE_VERSION = 2',
      'EXTENSION_BRIDGE_VERSION = 3',
    ),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /EXTENSION_BRIDGE_VERSION/);
});

test('catches a bridge request the record does not list', () => {
  const problems = checkExtensionProtocol(
    withChange(
      'extension/src/lib/bridge.js',
      "    case 'fetch':",
      "    case 'upload':\n    case 'fetch':",
    ),
  );
  assert.ok(problems.some((p) => /handled ops/.test(p)));
});

test('catches a panel that stops accepting the previous sidebar version', () => {
  const problems = checkExtensionProtocol((name) =>
    name === 'extension/protocol.json'
      ? real(name).replace('"minSidebarVersion": 1', '"minSidebarVersion": 2')
      : real(name),
  );
  assert.ok(problems.some((p) => /keep accepting the one before/.test(p)));
});

test('catches the content script speaking another protocol', () => {
  const problems = checkExtensionProtocol(
    withChange(
      'extension/src/bridge/content.js',
      "PROTOCOL = 'mawkingbird-extension/1'",
      "PROTOCOL = 'mawkingbird-extension/2'",
    ),
  );
  assert.ok(problems.some((p) => p.startsWith('extension/src/bridge/content.js')));
});
