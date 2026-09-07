import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deltaFromBaseline, parseRollout, snapshotSessions } from './i18n-metrics.mjs';

const token = (input, cached, output, reasoning, timestamp) =>
  JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: output,
          reasoning_output_tokens: reasoning,
        },
      },
    },
  });

test('reads effective metadata and latest cumulative counters without exposing conversation', () => {
  const text = [
    JSON.stringify({
      type: 'turn_context',
      timestamp: 'meta',
      payload: {
        model: 'test-model',
        effort: 'low',
        secret: 'never-output',
      },
    }),
    JSON.stringify({ type: 'response_item', payload: { text: 'never-output' } }),
    token(100, 40, 20, 5, 'a'),
    token(150, 60, 30, 8, 'b'),
  ].join('\n');
  const snapshot = parseRollout(text, 'session');
  assert.equal(snapshot.effectiveModel, 'test-model');
  assert.equal(snapshot.effectiveEffort, 'low');
  assert.equal(snapshot.counters.input_tokens, 150);
  assert.equal(snapshot.counterAtUtc, 'b');
  assert.equal(JSON.stringify(snapshot).includes('never-output'), false);
});

test('baseline deltas count cumulative growth and reset segments exactly once', () => {
  const initial = token(100, 40, 20, 5, 'a');
  const baseline = parseRollout(initial, 'session');
  const middle = [initial, token(150, 60, 30, 8, 'b'), token(10, 2, 4, 1, 'c')].join('\n');
  const final = parseRollout(`${middle}\n${token(25, 5, 10, 3, 'd')}`, 'session');
  const delta = deltaFromBaseline(final, baseline);
  assert.deepEqual(delta.counters, {
    input_tokens: 75,
    cached_input_tokens: 25,
    output_tokens: 20,
    reasoning_output_tokens: 6,
  });
  assert.equal(delta.uncachedInputTokens, 50);
  assert.equal(delta.segments.length, 2);
  assert.equal(deltaFromBaseline(final, parseRollout(middle, 'session')).counters.input_tokens, 15);
  assert.equal(deltaFromBaseline(final, final).counters.input_tokens, 0);
});

test('missing counters, missing baseline, changed sessions and replaced history remain unavailable', () => {
  const baseline = parseRollout(token(100, null, 20, null, 'a'), 'session');
  const current = parseRollout(
    [token(100, null, 20, null, 'a'), token(120, null, 30, null, 'b')].join('\n'),
    'session',
  );
  const delta = deltaFromBaseline(current, baseline);
  assert.equal(delta.counters.input_tokens, 20);
  assert.equal(delta.counters.cached_input_tokens, null);
  assert.equal(delta.uncachedInputTokens, null);
  assert.equal(delta.status, 'partial');
  assert.equal(deltaFromBaseline(current, null).counters.input_tokens, null);
  assert.equal(
    deltaFromBaseline(current, { ...baseline, sessionId: 'other' }).status,
    'unavailable',
  );
  assert.equal(
    deltaFromBaseline(parseRollout(token(120, 0, 30, 0, 'replaced'), 'session'), baseline).status,
    'unavailable',
  );
  assert.equal(parseRollout('{"type":"event_msg",partial', 'session').malformedRecords, 1);
});

test('CLI locates rollout by ID, saves baseline, computes delta and appends event', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'i18n-metrics-'));
  try {
    const rollout = join(dir, 'rollout-date-session.jsonl');
    const baseline = join(dir, 'baseline.json');
    const log = join(dir, 'events.jsonl');
    const initial = token(100, 40, 20, 5, 'a');
    await writeFile(rollout, initial);
    const script = fileURLToPath(new URL('./i18n-metrics.mjs', import.meta.url));
    execFileSync(process.execPath, [script, 'session', '--sessions', dir, '--out', baseline]);
    await writeFile(rollout, `${initial}\n${token(150, 60, 30, 8, 'b')}`);
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          script,
          'session',
          '--sessions',
          dir,
          '--baseline',
          baseline,
          '--log',
          log,
          '--event',
          'handoff',
          '--run-id',
          'run',
        ],
        { encoding: 'utf8' },
      ),
    );
    assert.equal(result.snapshots[0].delta.counters.input_tokens, 50);
    const event = JSON.parse((await readFile(log, 'utf8')).trim());
    assert.equal(event.runId, 'run');
    assert.equal(event.timeBasis, 'coordinator-observation');
    const [missing] = await snapshotSessions(['absent'], dir);
    assert.equal(missing.rolloutPath, null);
    assert.equal(missing.counters.input_tokens, null);
  } finally {
    const withinTemp = relative(tmpdir(), dir);
    assert.ok(withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp));
    await rm(dir, { recursive: true, force: true });
  }
});
