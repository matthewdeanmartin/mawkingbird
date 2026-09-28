import stylelint from 'stylelint';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../../design_system/stylelint.config.mjs';

// Inventory only: existing app CSS is not silently exempted from future rules.
const root = fileURLToPath(new URL('../', import.meta.url));
const { results } = await stylelint.lint({
  files: [resolve(root, 'src/app/**/*.css'), resolve(root, 'src/styles.css')].map((pattern) =>
    pattern.replaceAll('\\', '/'),
  ),
  config: {
    rules: Object.fromEntries(
      Object.entries(config.rules).filter(
        ([name]) => name.startsWith('color-') || name === 'function-disallowed-list',
      ),
    ),
  },
});
const findings = [];
if (!results.some((result) => result.source.replaceAll('\\', '/').includes('/src/app/'))) {
  throw new Error('The audit did not scan component stylesheets; check glob resolution.');
}
for (const result of results) {
  const lines = (await readFile(result.source, 'utf8')).split(/\r?\n/);
  for (const warning of result.warnings)
    findings.push({
      file: relative(resolve(root, '..'), result.source).replaceAll('\\', '/'),
      line: warning.line,
      column: warning.column,
      rule: warning.rule,
      source: lines[warning.line - 1].trim(),
      message: warning.text,
    });
}
findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
const destination = new URL('../../design_system/audits/02-legacy-colors.json', import.meta.url);
await mkdir(new URL('./', destination), { recursive: true });
await writeFile(
  destination,
  `${JSON.stringify({ status: 'inventory, not approved exceptions', filesScanned: results.length, findings }, null, 2)}\n`,
);
console.log(
  `Inventoried ${findings.length} color-policy findings across ${results.length} UI stylesheets.`,
);
