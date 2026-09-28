import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function checkReconciliation(inventory, ledger) {
  const expected = new Set(inventory.inventory.map((entry) => entry.file));
  const seen = new Set();
  const errors = [];
  for (const entry of ledger.entries) {
    if (seen.has(entry.file)) errors.push(`Duplicate: ${entry.file}`);
    seen.add(entry.file);
    if (!expected.has(entry.file)) errors.push(`Stale: ${entry.file}`);
    if (
      ![
        'shared implementation',
        'adopted scope',
        'partial adoption',
        'backlog',
        'lexical only',
      ].includes(entry.disposition) ||
      !entry.nextStep?.trim()
    )
      errors.push(`Unclassified: ${entry.file}`);
  }
  for (const file of expected) if (!seen.has(file)) errors.push(`Missing: ${file}`);
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inventory = JSON.parse(
    await readFile(
      new URL('../../design_system/audits/06-control-inventory.json', import.meta.url),
      'utf8',
    ),
  );
  const ledger = JSON.parse(
    await readFile(
      new URL('../../design_system/audits/11-reconciliation.json', import.meta.url),
      'utf8',
    ),
  );
  const errors = checkReconciliation(inventory, ledger);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    `All ${ledger.entries.length} candidate files have explicit dispositions. Backlog is not adoption or an exemption.`,
  );
}
