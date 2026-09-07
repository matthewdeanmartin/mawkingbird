#!/usr/bin/env node
// Coordinator-only measurement. Never emits rollout conversation content.
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const fields = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens'];
const emptyCounters = () => Object.fromEntries(fields.map((key) => [key, null]));
const counters = (usage) =>
  Object.fromEntries(
    fields.map((key) => [
      key,
      Number.isFinite(usage?.[key]) && usage[key] >= 0 ? usage[key] : null,
    ]),
  );

export function parseRollout(text, sessionId, observedAtUtc = new Date().toISOString()) {
  const result = {
    sessionId,
    effectiveModel: null,
    effectiveEffort: null,
    metadataAtUtc: null,
    counterAtUtc: null,
    observedAtUtc,
    counters: emptyCounters(),
    segments: [],
    malformedRecords: 0,
  };
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    // Ignore message bodies before parsing; only metadata and token events are relevant.
    if (!/"type"\s*:\s*"(?:session_meta|turn_context|event_msg)"/.test(line)) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      result.malformedRecords++;
      continue;
    }
    const payload = record.payload;
    if (record.type === 'session_meta' && payload?.id && payload.id !== sessionId) {
      throw new Error(`Rollout session ID does not match ${sessionId}`);
    }
    if (record.type === 'session_meta' || record.type === 'turn_context') {
      result.effectiveModel = payload?.model ?? null;
      result.effectiveEffort = payload?.effort ?? payload?.reasoning_effort ?? null;
      result.metadataAtUtc = record.timestamp ?? null;
    }
    if (
      record.type !== 'event_msg' ||
      payload?.type !== 'token_count' ||
      !payload.info?.total_token_usage
    )
      continue;
    const next = counters(payload.info.total_token_usage);
    const prior = result.segments.at(-1);
    const reset =
      prior &&
      fields.some(
        (key) =>
          next[key] !== null && prior.counters[key] !== null && next[key] < prior.counters[key],
      );
    if (!prior || reset) {
      result.segments.push({
        index: result.segments.length,
        startAtUtc: record.timestamp ?? null,
        endAtUtc: record.timestamp ?? null,
        reason: reset ? 'counter-reset' : 'initial',
        counters: next,
      });
    } else {
      prior.endAtUtc = record.timestamp ?? null;
      prior.counters = next;
    }
    result.counters = next;
    result.counterAtUtc = record.timestamp ?? null;
  }
  return result;
}

export function deltaFromBaseline(snapshot, baseline) {
  if (
    !baseline ||
    baseline.sessionId !== snapshot.sessionId ||
    !baseline.segments?.length ||
    snapshot.segments.length < baseline.segments.length
  ) {
    return {
      status: 'unavailable',
      counters: emptyCounters(),
      uncachedInputTokens: null,
      segments: [],
    };
  }
  const startIndex = baseline.segments.length - 1;
  if (snapshot.segments[startIndex].startAtUtc !== baseline.segments[startIndex].startAtUtc) {
    return {
      status: 'unavailable',
      counters: emptyCounters(),
      uncachedInputTokens: null,
      segments: [],
    };
  }
  const segments = snapshot.segments.slice(startIndex).map((segment, offset) => ({
    index: segment.index,
    reason: segment.reason,
    counters: Object.fromEntries(
      fields.map((key) => {
        const before = offset === 0 ? baseline.segments[startIndex].counters[key] : 0;
        const after = segment.counters[key];
        return [key, before === null || after === null || after < before ? null : after - before];
      }),
    ),
  }));
  const totals = Object.fromEntries(
    fields.map((key) => [
      key,
      segments.some((segment) => segment.counters[key] === null)
        ? null
        : segments.reduce((sum, segment) => sum + segment.counters[key], 0),
    ]),
  );
  return {
    status: fields.some((key) => totals[key] === null) ? 'partial' : 'available',
    counters: totals,
    uncachedInputTokens:
      totals.input_tokens !== null && totals.cached_input_tokens !== null
        ? totals.input_tokens - totals.cached_input_tokens
        : null,
    segments,
  };
}

async function rolloutFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? rolloutFiles(join(directory, entry.name))
        : entry.name.endsWith('.jsonl')
          ? [join(directory, entry.name)]
          : [],
    ),
  );
  return nested.flat();
}

export async function snapshotSessions(sessionIds, directory) {
  const files = await rolloutFiles(directory);
  return Promise.all(
    sessionIds.map(async (sessionId) => {
      if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) throw new Error('Invalid session ID');
      const matches = files.filter((file) => file.endsWith(`-${sessionId}.jsonl`));
      if (matches.length > 1) throw new Error(`Ambiguous rollout for ${sessionId}`);
      const file = matches[0] ?? null;
      return {
        ...parseRollout(file ? await readFile(file, 'utf8') : '', sessionId),
        rolloutPath: file,
      };
    }),
  );
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      sessions: { type: 'string' },
      baseline: { type: 'string' },
      out: { type: 'string' },
      log: { type: 'string' },
      event: { type: 'string' },
      'run-id': { type: 'string' },
      'batch-id': { type: 'string' },
      'agent-id': { type: 'string' },
      stage: { type: 'string' },
      'artifact-hash': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'node ui/scripts/i18n-metrics.mjs SESSION_ID... [--sessions DIR] [--out FILE] [--baseline FILE]\n' +
        '  [--log JSONL --event NAME --run-id ID --batch-id ID --agent-id ID --stage NAME --artifact-hash HASH]\n' +
        'Deltas use cumulative counters; reset segments are counted once. Missing data is null.\n' +
        'Event time is coordinator observation time, not an inferred artifact write time.',
    );
    return;
  }
  if (!positionals.length) throw new Error('Supply at least one session ID');
  if (values.log && (!values.event || !values['run-id']))
    throw new Error('--log requires --event and --run-id');
  const directory =
    values.sessions ?? join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions');
  const baseline = values.baseline ? JSON.parse(await readFile(values.baseline, 'utf8')) : null;
  const snapshots = await snapshotSessions([...new Set(positionals)], directory);
  for (const snapshot of snapshots) {
    snapshot.delta = deltaFromBaseline(
      snapshot,
      baseline?.snapshots?.find((item) => item.sessionId === snapshot.sessionId),
    );
  }
  const atUtc = new Date().toISOString();
  const result = { version: 1, atUtc, snapshots };
  if (values.out) await writeFile(values.out, `${JSON.stringify(result, null, 2)}\n`);
  if (values.log) {
    await appendFile(
      values.log,
      snapshots
        .map((snapshot) =>
          JSON.stringify({
            runId: values['run-id'],
            batchId: values['batch-id'] ?? null,
            agentId: values['agent-id'] ?? null,
            sessionId: snapshot.sessionId,
            stage: values.stage ?? null,
            event: values.event,
            atUtc,
            observedAtUtc: atUtc,
            timeBasis: 'coordinator-observation',
            counterSnapshot: snapshot,
            artifactHash: values['artifact-hash'] ?? null,
          }),
        )
        .join('\n') + '\n',
    );
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
