import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReconciliation } from "../../ui/scripts/check-design-reconciliation.mjs";
const inventory = { inventory: [{ file: "a.html" }] };
const entry = {
  file: "a.html",
  disposition: "backlog",
  nextStep: "Review the form and save contract before adoption.",
};
test("explicit backlog is accounted for without pretending adoption", () =>
  assert.deepEqual(checkReconciliation(inventory, { entries: [entry] }), []));
test("new candidates cannot disappear from reconciliation", () =>
  assert.deepEqual(checkReconciliation(inventory, { entries: [] }), [
    "Missing: a.html",
  ]));
test("stale and duplicate candidates fail", () => {
  const errors = checkReconciliation(inventory, {
    entries: [entry, entry, { ...entry, file: "old.html" }],
  });
  assert.deepEqual(errors, ["Duplicate: a.html", "Stale: old.html"]);
});
test("empty or invented dispositions fail", () => {
  assert.deepEqual(
    checkReconciliation(inventory, {
      entries: [{ ...entry, disposition: "done-ish" }],
    }),
    ["Unclassified: a.html"],
  );
  assert.deepEqual(
    checkReconciliation(inventory, { entries: [{ ...entry, nextStep: "" }] }),
    ["Unclassified: a.html"],
  );
});
