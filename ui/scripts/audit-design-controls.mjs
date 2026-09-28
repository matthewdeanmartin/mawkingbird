import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative, resolve, sep } from 'node:path';
const root = fileURLToPath(new URL('../src/app/', import.meta.url));
const repo = resolve(root, '../../..');
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(html|ts|css)$/.test(path) && !/\.spec\.ts$/.test(path)) files.push(path);
  }
}
await walk(root);
const patterns = {
  shared:
    /\b(?:mbButton|mbToolbarButton|mbPostAction|mbContentLink)\b|<mb-(?:checkbox|field|radio-group|toolbar|post-actions|dialog|popover|notice|metadata|badge|content-state)\b/g,
  nativeButtons: /<button\b/g,
  checkboxes: /type\s*=\s*['"]checkbox['"]/g,
  radios: /type\s*=\s*['"]radio['"]/g,
  selects: /<select\b/g,
  legacyPills: /class\s*=\s*['"][^'"]*\bbtn\b/g,
  overlays: /role\s*=\s*['"](?:dialog|menu)['"]|<dialog\b/g,
  disclosure: /<details\b/g,
  stylingEscapes: /::ng-deep|!important/g,
};
const inventory = [];
// Sort portable paths, so Windows and Linux generate identical inventories.
const portable = (path) => relative(repo, path).split(sep).join('/');
files.sort((a, b) => (portable(a) < portable(b) ? -1 : portable(a) > portable(b) ? 1 : 0));
for (const path of files) {
  const source = await readFile(path, 'utf8');
  const findings = [];
  for (const [pattern, regex] of Object.entries(patterns)) {
    for (const match of source.matchAll(regex)) {
      findings.push({ pattern, line: source.slice(0, match.index).split('\n').length });
    }
  }
  if (findings.length)
    inventory.push({
      file: relative(repo, path).split(sep).join('/'),
      status: path.includes(`${resolve(root, 'design-system')}`)
        ? 'shared implementation'
        : 'needs semantic review',
      findings,
    });
}
const report = {
  scope:
    'All maintained ui/src/app HTML, non-spec TypeScript and CSS. Lexical candidates include comments and inline templates; counts are NOT violations or adoption percentages.',
  filesScanned: files.length,
  filesWithCandidates: inventory.length,
  inventory,
};
const output = `${JSON.stringify(report, null, 2)}\n`;
const target = new URL('../../design_system/audits/06-control-inventory.json', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')).split(String.fromCharCode(13)).join('') !== output)
    throw new Error(
      'Design inventory changed. Run npm run design:audit-controls, review the diff, and update design_system/audits/06-consolidation.md.',
    );
} else await writeFile(target, output);
console.log(
  `Scanned ${files.length} source files; ${inventory.length} have control/style candidates. Semantic classification remains in the sprint audit.`,
);
