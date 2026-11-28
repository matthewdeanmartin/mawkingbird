import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  BRIDGE_OPS,
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  MIN_PANEL_VERSION,
  PANEL_CHANNEL,
  PANEL_VERSION,
  panelAccepted,
} from '../src/lib/protocol.js';

test('the constants match protocol.json', async () => {
  const record = JSON.parse(await readFile(new URL('../protocol.json', import.meta.url), 'utf8'));
  assert.equal(BRIDGE_PROTOCOL, record.bridge.protocol);
  assert.equal(BRIDGE_VERSION, record.bridge.version);
  assert.deepEqual([...BRIDGE_OPS], record.bridge.ops);
  assert.equal(PANEL_CHANNEL, record.panel.channel);
  assert.equal(PANEL_VERSION, record.panel.version);
  assert.equal(MIN_PANEL_VERSION, record.panel.minPanelVersion);
});

test('the sidebar drives its own panel version and the one before', () => {
  assert.equal(panelAccepted({ version: PANEL_VERSION }), true);
  // 0.7.0's panel said ready without a version (version 1).
  assert.equal(panelAccepted({}), true);
  assert.equal(panelAccepted({ version: MIN_PANEL_VERSION - 1 }), false);
});
