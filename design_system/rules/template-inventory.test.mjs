import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { designTemplateNodes } from "../../ui/scripts/design-template-nodes.mjs";
const require = createRequire(
  new URL("../../ui/package.json", import.meta.url),
);
const { parseTemplate } = await import(
  pathToFileURL(require.resolve("@angular/compiler")).href
);

for (const [name, template, expected] of [
  [
    "switch case groups",
    '@switch(state) { @case("loading") { <span mbSpinner></span> } @case("found") { <div mbDiscoveryCandidate></div> } @default { <button mbButton></button> } }',
    ["mbSpinner", "mbDiscoveryCandidate", "mbButton"],
  ],
  [
    "nested conditionals and loops",
    "@if(ready) { @for(row of rows; track row) { <a mbNavLink></a> } @empty { <div mbContentState></div> } } @else { <button mbButton></button> }",
    ["mbNavLink", "mbContentState", "mbButton"],
  ],
  [
    "deferred content and alternatives",
    "@defer { <button mbButton></button> } @placeholder { <span mbSpinner></span> } @loading { <span mbSpinner></span> } @error { <div mbNotice></div> }",
    ["mbButton", "mbSpinner", "mbSpinner", "mbNotice"],
  ],
]) {
  test(`source adoption visits ${name} exactly once`, () => {
    const parsed = parseTemplate(template, "inventory.html");
    assert.equal(parsed.errors, null);
    const attributes = [...designTemplateNodes(parsed.nodes)].flatMap(
      (node) => node.attributes?.map((attribute) => attribute.name) ?? [],
    );
    assert.deepEqual(attributes, expected);
  });
}
