/** Reserve the same 500-key source batches for every new UI locale. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceHash, validateSnapshot } from './i18n-ledger.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const planPath = join(root, 'i18n-context', 'fixed-batches.json');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
function flatten(value, prefix = '', result = {}) {
  for (const [key, text] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (text && typeof text === 'object') flatten(text, full, result);
    else result[full] = text;
  }
  return result;
}
const english = flatten(read(join(root, 'public', 'i18n', 'en.json')));
const context = read(join(root, 'i18n-context', 'en.context.json'));
const keys = Object.keys(english).filter((key) => context[key]?.translate !== false).sort();
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (args.includes('--create')) {
  if (existsSync(planPath)) throw new Error('Plan already exists; do not repartition active assignments.');
  const batches = [];
  for (let start = 0; start < keys.length; start += 500) {
    const selected = keys.slice(start, start + 500);
    batches.push({
      id: String(batches.length + 1).padStart(3, '0'),
      keys: Object.fromEntries(selected.map((key) => [key, sourceHash(english[key], context[key])])),
    });
  }
  write(planPath, { version: 1, batchSize: 500, batches });
}
const plan = read(planPath);
const planned = plan.batches.flatMap((batch) => Object.keys(batch.keys));
if (new Set(planned).size !== planned.length || JSON.stringify([...planned].sort()) !== JSON.stringify(keys)) {
  throw new Error('Source inventory changed or plan overlaps. Coordinator must reconcile assignments explicitly.');
}
for (const batch of plan.batches) {
  validateSnapshot(Object.keys(batch.keys), { locale: 'source', keys: batch.keys }, 'source', english, context);
}
const batchId = option('batch');
if (!batchId) {
  console.log(`${plan.batches.length} fixed batches: ${planned.length} eligible keys; 500 per batch except final remainder.`);
  for (const batch of plan.batches) console.log(`${batch.id}: ${Object.keys(batch.keys).length}`);
} else {
  const batch = plan.batches.find((entry) => entry.id === batchId.padStart(3, '0'));
  if (!batch) throw new Error(`Unknown batch ${batchId}`);
  const locale = option('locale');
  const source = option('source');
  if (!locale || !source) throw new Error('Use --batch=001 --locale=uk --source=tmp_uk_001.source.json');
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(locale)) throw new Error('Invalid locale');
  write(source, { locale, keys: batch.keys });
  for (const key of Object.keys(batch.keys)) {
    console.log(JSON.stringify({ key, english: english[key], context: context[key] ?? {} }));
  }
}
