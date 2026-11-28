// Mawkingbird for Firefox and the web app talk over two small protocols (the
// bridge, and the sidebar panel). They ship separately, so each side must say
// its version and accept the one before. This keeps every copy of the
// constants in step with extension/protocol.json, and fails when a side drifts
// or stops accepting the previous version. Static: reads files, runs nothing.
//
//   node scripts/check-extension-protocol.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => readFileSync(path.join(repo, file), 'utf8');

export function checkExtensionProtocol(readFile = read) {
  const problems = [];
  const record = JSON.parse(readFile('extension/protocol.json'));
  const { bridge, panel } = record;

  const expect = (file, label, actual, wanted) => {
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      problems.push(
        `${file}: ${label} is ${JSON.stringify(actual)}, protocol.json says ${JSON.stringify(wanted)}`,
      );
    }
  };
  const constant = (source, name) => {
    const match = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*(?:'([^']*)'|(\\d+))`).exec(source);
    return match ? (match[1] ?? Number(match[2])) : undefined;
  };
  const list = (source, name) => {
    const match = new RegExp(`${name}\\s*=\\s*(?:Object\\.freeze\\()?\\[([^\\]]*)\\]`).exec(source);
    return match ? [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : undefined;
  };

  // The extension.
  const extProtocol = 'extension/src/lib/protocol.js';
  const ext = readFile(extProtocol);
  expect(extProtocol, 'BRIDGE_PROTOCOL', constant(ext, 'BRIDGE_PROTOCOL'), bridge.protocol);
  expect(extProtocol, 'BRIDGE_VERSION', constant(ext, 'BRIDGE_VERSION'), bridge.version);
  expect(extProtocol, 'BRIDGE_OPS', list(ext, 'BRIDGE_OPS'), bridge.ops);
  expect(extProtocol, 'PANEL_CHANNEL', constant(ext, 'PANEL_CHANNEL'), panel.channel);
  expect(extProtocol, 'PANEL_VERSION', constant(ext, 'PANEL_VERSION'), panel.version);
  expect(
    extProtocol,
    'MIN_PANEL_VERSION',
    constant(ext, 'MIN_PANEL_VERSION'),
    panel.minPanelVersion,
  );
  for (const file of ['extension/src/bridge/content.js', 'extension/client/bridge-client.js']) {
    expect(file, 'PROTOCOL', constant(readFile(file), 'PROTOCOL'), bridge.protocol);
  }
  // Every op the record lists is one the bridge handles, and no other.
  const bridgeFile = 'extension/src/lib/bridge.js';
  const handler = readFile(bridgeFile);
  const body = handler.slice(handler.indexOf('export async function handleBridgeRequest'));
  const handled = [...body.slice(0, body.indexOf('\n}\n')).matchAll(/case '([A-Za-z]+)':/g)].map(
    (m) => m[1],
  );
  expect(bridgeFile, 'handled ops', [...handled].sort(), [...bridge.ops].sort());

  // The web app.
  const appBridge = 'ui/src/app/platform/extension/extension-bridge.ts';
  const app = readFile(appBridge);
  expect(appBridge, 'EXTENSION_PROTOCOL', constant(app, 'EXTENSION_PROTOCOL'), bridge.protocol);
  expect(
    appBridge,
    'EXTENSION_BRIDGE_VERSION',
    constant(app, 'EXTENSION_BRIDGE_VERSION'),
    bridge.version,
  );
  expect(appBridge, 'EXTENSION_OPS', list(app, 'EXTENSION_OPS'), bridge.ops);
  const appPanel = 'ui/src/app/shell/page-panel/page-panel.ts';
  const panelSource = readFile(appPanel);
  expect(appPanel, 'PANEL_CHANNEL', constant(panelSource, 'PANEL_CHANNEL'), panel.channel);
  expect(appPanel, 'PANEL_VERSION', constant(panelSource, 'PANEL_VERSION'), panel.version);
  expect(
    appPanel,
    'MIN_SIDEBAR_VERSION',
    constant(panelSource, 'MIN_SIDEBAR_VERSION'),
    panel.minSidebarVersion,
  );

  // Each side keeps accepting the version before its own, so either can deploy first.
  for (const [name, min, version] of [
    ['panel.minSidebarVersion', panel.minSidebarVersion, panel.version],
    ['panel.minPanelVersion', panel.minPanelVersion, panel.version],
  ]) {
    if (min > Math.max(1, version - 1)) {
      problems.push(
        `extension/protocol.json: ${name} ${min} drops version ${version - 1}; keep accepting the one before`,
      );
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkExtensionProtocol();
  if (problems.length) {
    console.error(`Extension protocol drift (${problems.length}):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('Extension protocol: both sides match extension/protocol.json.');
  }
}
