// Source adoption, not deployment status or percentage of the app migrated.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { parseTemplate } from '@angular/compiler';

const root = fileURLToPath(new URL('../src/app/', import.meta.url));
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(html|ts)$/.test(path) && !/\.spec\.ts$/.test(path)) files.push(path);
  }
}
await walk(root);
files.sort();
const templates = [],
  widgets = [];
const portable = (path) => relative(root, path).split(sep).join('/');
for (const path of files) {
  const file = portable(path),
    source = await readFile(path, 'utf8');
  if (path.endsWith('.html')) {
    templates.push({ file, source });
    continue;
  }
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) {
      for (const decorator of ts.getDecorators(node) ?? []) {
        if (!ts.isCallExpression(decorator.expression)) continue;
        const metadata = decorator.expression.arguments[0];
        if (!metadata || !ts.isObjectLiteralExpression(metadata)) continue;
        const template = metadata.properties.find(
          (p) => ts.isPropertyAssignment(p) && p.name.getText(ast) === 'template',
        );
        if (
          template &&
          (ts.isStringLiteral(template.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(template.initializer))
        )
          templates.push({ file, source: template.initializer.text });
        const selector = metadata.properties.find(
          (p) => ts.isPropertyAssignment(p) && p.name.getText(ast) === 'selector',
        );
        if (
          file.startsWith('design-system/') &&
          selector &&
          ts.isStringLiteral(selector.initializer)
        ) {
          widgets.push({
            name: node.name.text,
            selector: selector.initializer.text,
            file,
            direct: [],
            internal: [],
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
function matches(node, selector) {
  return selector.split(',').some((part) => {
    const [, tag, attr] = part.trim().match(/^([\w-]+)(?:\[([\w-]+)\])$/) ?? [];
    if (!tag) return node.name === part.trim();
    return (
      (node.name ?? node.tagName) === tag &&
      [...(node.attributes ?? []), ...(node.inputs ?? []), ...(node.templateAttrs ?? [])].some(
        (a) => a.name === attr,
      )
    );
  });
}
for (const { file, source } of templates) {
  const parsed = parseTemplate(source, file);
  if (parsed.errors?.length) throw new Error(`Cannot count ${file}: ${parsed.errors.join('\n')}`);
  const counts = new Map();
  function visit(node) {
    for (const widget of widgets)
      if (matches(node, widget.selector))
        counts.set(widget.name, (counts.get(widget.name) ?? 0) + 1);
    for (const key of ['children', 'branches', 'cases'])
      for (const child of node[key] ?? []) visit(child);
    for (const key of ['empty', 'placeholder', 'loading', 'error'])
      if (node[key]?.children) visit(node[key]);
  }
  for (const node of parsed.nodes) visit(node);
  for (const widget of widgets) {
    if (counts.has(widget.name))
      widget[file.startsWith('design-system/') ? 'internal' : 'direct'].push({
        file,
        count: counts.get(widget.name),
      });
  }
}
const used = new Set(widgets.filter((w) => w.direct.length).map((w) => w.name));
let changed = true;
while (changed) {
  changed = false;
  for (const widget of widgets) {
    if (used.has(widget.name)) continue;
    const reachable = widget.internal.some((usage) =>
      widgets.some(
        (parent) => used.has(parent.name) && usage.file.replace(/\.html$/, '.ts') === parent.file,
      ),
    );
    if (reachable) {
      used.add(widget.name);
      changed = true;
    }
  }
}
const counts = Object.fromEntries(
  widgets.map((w) => [w.name, w.direct.reduce((n, usage) => n + usage.count, 0)]),
);
const report = {
  scope:
    'Maintained Angular app template call sites; excludes stories, specs and shared internals from direct counts. Repeated runtime rows count once per source node. Integration means source usage, not commit, deployment or full app coverage.',
  widgetsAvailable: widgets.length,
  widgetsDirectlyUsed: widgets.filter((w) => w.direct.length).length,
  widgetsUsedThroughCompositionOnly: widgets
    .filter((w) => used.has(w.name) && !w.direct.length)
    .map((w) => w.name),
  widgetsWithoutAppUsage: widgets.filter((w) => !used.has(w.name)).map((w) => w.name),
  appTemplateFiles: new Set(widgets.flatMap((w) => w.direct.map((u) => u.file))).size,
  directTemplateCallSites: Object.values(counts).reduce((a, b) => a + b, 0),
  widgets: widgets.map((w) => ({
    name: w.name,
    selector: w.selector,
    directCallSites: counts[w.name],
    consumers: w.direct,
    integrated: used.has(w.name),
  })),
};
console.log(JSON.stringify(report, null, 2));
