/** Source-bound compact work orders. This module packages text; it never translates. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceHash } from './i18n-ledger.mjs';
import { optionalTerminology } from './i18n-optional-terminology.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: 'wx' });
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
export function flatten(value, prefix = '', out = {}) {
  for (const [key, text] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (text && typeof text === 'object') flatten(text, full, out);
    else out[full] = text;
  }
  return out;
}
export function makeManifest(locale, batch, english, context, policyHash) {
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(locale)) throw new Error('Invalid locale');
  const records = Object.entries(batch.keys).map(([key, expected], index) => {
    if (sourceHash(english[key], context[key]) !== expected)
      throw new Error(`Source drift: ${key}`);
    return {
      id: `b${batch.id}-${String(index + 1).padStart(3, '0')}`,
      key,
      english: english[key],
      context: context[key] ?? null,
      sourceHash: expected,
      optionalParameters: optionalTerminology[key] ?? [],
    };
  });
  const body = { version: 1, locale, batchId: batch.id, policyHash, records };
  return { ...body, manifestHash: digest(canonical(body)) };
}
export function validateManifest(manifest, locale, english, context, policyHash) {
  const { manifestHash, ...body } = manifest;
  if (manifestHash !== digest(canonical(body))) throw new Error('Manifest hash mismatch');
  if (manifest.locale !== locale) throw new Error('Wrong locale');
  if (manifest.policyHash !== policyHash) throw new Error('Validation policy drift');
  const ids = new Set();
  const keys = new Set();
  for (const entry of manifest.records) {
    if (ids.has(entry.id) || keys.has(entry.key)) throw new Error('Duplicate manifest ID/key');
    ids.add(entry.id);
    keys.add(entry.key);
    if (
      sourceHash(english[entry.key], context[entry.key]) !== entry.sourceHash ||
      sourceHash(entry.english, entry.context) !== entry.sourceHash
    )
      throw new Error(`Source drift: ${entry.key}`);
  }
}
export function pairsMap(pairs, manifest, complete = true) {
  if (!Array.isArray(pairs)) throw new Error('Expected explicit ID/text pairs');
  const allowed = new Set(manifest.records.map((entry) => entry.id));
  const result = new Map();
  for (const pair of pairs) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      typeof pair[1] !== 'string' ||
      !pair[1].trim()
    )
      throw new Error('Malformed ID/text pair');
    const [id, text] = pair;
    if (!allowed.has(id)) throw new Error(`Unknown ID: ${id}`);
    if (result.has(id)) throw new Error(`Duplicate ID: ${id}`);
    result.set(id, text);
  }
  if (complete && result.size !== allowed.size)
    throw new Error(`Incomplete: ${result.size}/${allowed.size}`);
  return result;
}
export function candidateMap(manifest, candidate, complete = true) {
  if (candidate.manifestHash !== manifest.manifestHash)
    throw new Error('Candidate manifest mismatch');
  return pairsMap(candidate.entries, manifest, complete);
}
export function applyReview(manifest, candidate, candidateBytes, review) {
  const values = candidateMap(manifest, candidate);
  if (
    review.manifestHash !== manifest.manifestHash ||
    review.candidateHash !== digest(candidateBytes)
  ) {
    throw new Error('Review binding mismatch');
  }
  if (review.reviewedCount !== manifest.records.length) throw new Error('Incomplete review');
  if (!Array.isArray(review.blockers) || review.blockers.length)
    throw new Error('Unresolved review blockers');
  for (const [id, text] of pairsMap(review.corrections, manifest, false)) values.set(id, text);
  return values;
}
export function fullKeys(manifest, values) {
  return Object.fromEntries(manifest.records.map(({ id, key }) => [key, values.get(id)]));
}
function environment() {
  return {
    english: flatten(read(join(root, 'public/i18n/en.json'))),
    context: read(join(root, 'i18n-context/en.context.json')),
    policyHash: digest(
      ['i18n-optional-terminology.mjs', 'i18n-locale-rules.mjs', 'i18n-merge.mjs']
        .map((name) => readFileSync(join(root, 'scripts', name), 'utf8'))
        .join('\n'),
    ),
  };
}
function payload(manifest, values) {
  const header = {
    locale: manifest.locale,
    batchId: manifest.batchId,
    manifestHash: manifest.manifestHash,
    count: manifest.records.length,
    outputSchema: values
      ? {
          manifestHash: manifest.manifestHash,
          candidateHash: '<from header>',
          reviewedCount: manifest.records.length,
          corrections: [['explicit-id', 'corrected text']],
          blockers: [],
        }
      : { manifestHash: manifest.manifestHash, entries: [['explicit-id', 'authored text']] },
  };
  const rows = manifest.records.map((entry) => ({
    id: entry.id,
    english: entry.english,
    ...(!entry.context?.desc ? { hint: entry.key } : {}),
    ...(entry.context ? { context: entry.context } : {}),
    ...(entry.optionalParameters.length ? { optionalParameters: entry.optionalParameters } : {}),
    ...(values ? { candidate: values.get(entry.id) } : {}),
  }));
  return { header, rows };
}
export function main(args) {
  const [command, ...rest] = args;
  const options = Object.fromEntries(
    rest.map((arg) => {
      const cut = arg.indexOf('=');
      if (!arg.startsWith('--') || cut < 0) throw new Error('Options must be --name=value');
      return [arg.slice(2, cut), arg.slice(cut + 1)];
    }),
  );
  const { english, context, policyHash } = environment();
  if (command === 'prepare') {
    const plan = read(join(root, 'i18n-context/fixed-batches.json'));
    const batch = plan.batches.find((entry) => entry.id === options.batch);
    if (!batch) throw new Error('Unknown batch');
    const manifest = makeManifest(options.locale, batch, english, context, policyHash);
    const out = resolve(options.out);
    mkdirSync(out, { recursive: true });
    write(join(out, 'manifest.json'), manifest);
    write(join(out, 'source.json'), { locale: options.locale, keys: batch.keys });
    const work = payload(manifest);
    writeFileSync(
      join(out, 'author.jsonl'),
      [work.header, ...work.rows].map((row) => JSON.stringify(row)).join('\n') + '\n',
      { flag: 'wx' },
    );
    console.log(
      JSON.stringify({ out, count: work.rows.length, manifestHash: manifest.manifestHash }),
    );
    return;
  }
  const manifest = read(options.manifest);
  validateManifest(manifest, options.locale, english, context, policyHash);
  const bytes = readFileSync(options.candidate);
  const candidate = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (command === 'review-input') {
    const values = candidateMap(manifest, candidate);
    const work = payload(manifest, values);
    work.header.candidateHash = digest(bytes);
    work.header.outputSchema.candidateHash = work.header.candidateHash;
    writeFileSync(
      options.out,
      [work.header, ...work.rows].map((row) => JSON.stringify(row)).join('\n') + '\n',
      { flag: 'wx' },
    );
    console.log(JSON.stringify({ count: values.size, candidateHash: work.header.candidateHash }));
  } else if (command === 'expand') {
    const values = options.review
      ? applyReview(manifest, candidate, bytes, read(options.review))
      : candidateMap(manifest, candidate);
    write(options.out, fullKeys(manifest, values));
    console.log(JSON.stringify({ count: values.size, out: options.out }));
  } else throw new Error('Use prepare, review-input or expand');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
