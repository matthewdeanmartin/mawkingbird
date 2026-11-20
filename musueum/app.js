const $ = (selector) => document.querySelector(selector);
const cards = $("#cards");
const search = $("#search");
const area = $("#area");
const topic = $("#topic");
const strong = $("#strong");
const yappingLimit = $("#yapping-limit");
const more = $("#more");
const dialog = $("#source-dialog");
const redraftDialog = $("#redraft-dialog");
const redraftStatus = $("#redraft-status");
const redraftResults = $("#redraft-results");
const labels = {
  privacy: "Privacy / data flow",
  completeness: "Absolute / complete",
  cost: "Cost / availability",
  hosting: "Source / hosting",
  outcome: "Outcome / ease",
};
const storageKey = "mawkingbird-museum-needs-edit-v1";
const redraftStorageKey = "mawkingbird-museum-redraft-settings-v1";
const strongWords = [
  "all",
  "always",
  "every",
  "forever",
  "free",
  "guaranteed",
  "never",
  "nothing",
  "only",
  "entire",
  "whole",
  "unlimited",
];
const strongPattern = new RegExp(`\\b(?:${strongWords.join("|")})\\b`, "i");
let records = [];
let shown = 60;
let view = "all";
let currentSource = null;
let currentDraftRecord = null;
let marked;
try {
  marked = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));
} catch {
  marked = new Set();
}

function recordMark(record) {
  return `${record.file}\u0000${record.key || record.text}`;
}

function element(name, className, value) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function button(label, action, variant = "compact") {
  const node = element("button", "", label);
  node.type = "button";
  node.setAttribute("mbButton", "");
  node.dataset.variant = variant;
  node.dataset.action = action;
  return node;
}

function snippetText(record) {
  const paragraph = element("p", "snippet");
  if (!strong.value) {
    paragraph.textContent = record.text;
    return paragraph;
  }
  const pattern = new RegExp(
    `\\b(?:${strong.value === "*" ? strongWords.join("|") : strong.value})\\b`,
    "gi",
  );
  let start = 0;
  for (const match of record.text.matchAll(pattern)) {
    paragraph.append(
      document.createTextNode(record.text.slice(start, match.index)),
    );
    paragraph.append(element("mark", "strong-match", match[0]));
    start = match.index + match[0].length;
  }
  paragraph.append(document.createTextNode(record.text.slice(start)));
  return paragraph;
}

function card(record) {
  const article = element("article", "card");
  article.dataset.review = String(record.review.length > 0);
  const head = element("div", "card-head");
  head.append(
    element(
      "span",
      "kind",
      record.kind === "i18n" ? "I18n string" : record.kind,
    ),
  );
  if (record.review.length)
    head.append(element("span", "review-label", "Review prompt"));
  article.append(head, snippetText(record));
  if (record.key) article.append(element("p", "key", record.key));
  if (view === "yapping")
    article.append(
      element(
        "p",
        "length",
        `${record.text.length.toLocaleString()} characters`,
      ),
    );
  if (record.review.length) {
    const topics = element("div", "topics");
    for (const id of record.review)
      topics.append(element("span", "topic", labels[id]));
    article.append(topics);
  }
  const foot = element("div", "card-foot");
  foot.append(element("span", "location", `${record.file}:${record.line}`));
  const actions = element("div", "card-actions");
  const source = button("Source", "source");
  const redraft = button("Redraft", "redraft");
  const mark = button("Needs edit", "mark");
  mark.dataset.marked = String(marked.has(recordMark(record)));
  mark.setAttribute("aria-pressed", mark.dataset.marked);
  actions.append(source, redraft, mark);
  foot.append(actions);
  article.append(foot);
  source.addEventListener("click", () => openSource(record));
  redraft.addEventListener("click", () => openRedraft(record));
  mark.addEventListener("click", () => toggleMark(record));
  return article;
}

function filtered() {
  const query = search.value.trim().toLocaleLowerCase();
  const matches = records.filter((record) => {
    if (view === "eyebrow" && record.kind !== "eyebrow") return false;
    if (view === "review" && !record.review.length) return false;
    if (
      view === "yapping" &&
      (!record.key || record.text.length < Number(yappingLimit.value))
    )
      return false;
    if (view === "marked" && !marked.has(recordMark(record))) return false;
    if (area.value && record.area !== area.value) return false;
    if (topic.value && !record.review.includes(topic.value)) return false;
    if (strong.value) {
      const pattern =
        strong.value === "*"
          ? strongPattern
          : new RegExp(`\\b${strong.value}\\b`, "i");
      if (!pattern.test(record.text)) return false;
    }
    if (
      query &&
      !`${record.text} ${record.key} ${record.file}`
        .toLocaleLowerCase()
        .includes(query)
    )
      return false;
    return true;
  });
  if (view === "yapping")
    matches.sort(
      (a, b) => b.text.length - a.text.length || a.key.localeCompare(b.key),
    );
  return matches;
}

function render() {
  const matches = filtered();
  const fragment = document.createDocumentFragment();
  for (const record of matches.slice(0, shown)) fragment.append(card(record));
  cards.replaceChildren(fragment);
  if (!matches.length)
    cards.append(element("div", "empty", "No strings match these filters."));
  $("#result-count").textContent =
    `${matches.length.toLocaleString()} shown in this view${matches.length > shown ? ` · first ${shown.toLocaleString()} loaded` : ""}`;
  $("#marked-count").textContent = marked.size.toLocaleString();
  more.hidden = matches.length <= shown;
}

function toggleMark(record) {
  const key = recordMark(record);
  if (marked.has(key)) marked.delete(key);
  else marked.add(key);
  localStorage.setItem(storageKey, JSON.stringify([...marked]));
  render();
}

async function openSource(record) {
  const url = `/excerpt.json?file=${encodeURIComponent(record.file)}&line=${record.line}`;
  const response = await fetch(url);
  if (!response.ok) return;
  currentSource = await response.json();
  $("#source-title").textContent =
    `${currentSource.file}:${currentSource.line}`;
  $("#source-code").textContent = currentSource.text
    .split("\n")
    .map(
      (line, index) =>
        `${String(currentSource.start + index).padStart(5)}  ${line}`,
    )
    .join("\n");
  dialog.showModal();
}

function redraftFields() {
  return {
    models: [0, 1, 2].map((index) => $(`#model-${index}`).value.trim()),
    instructions: [0, 1, 2].map((index) =>
      $(`#instruction-${index}`).value.trim(),
    ),
    alternativesPerPair: Number($("#alternatives-per-pair").value),
  };
}

async function openRedraft(record) {
  currentDraftRecord = record;
  redraftResults.replaceChildren();
  redraftStatus.textContent = "";
  $("#redraft-location").textContent =
    `${record.file}:${record.line}${record.key ? ` · ${record.key}` : ""}`;
  $("#redraft-original").textContent = record.text;
  $("#redraft-availability").textContent =
    record.key && record.edit?.format === "i18n-comment"
      ? "Approval updates the English source and generated English JSON, then removes this key from non-English locales."
      : "Approval is available for plain HTML snippets without separate translated templates. Other copy can be generated and copied, then edited manually in its source.";
  redraftDialog.showModal();
  try {
    const response = await fetch("/redraft-config");
    const config = await response.json();
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(redraftStorageKey) || "{}");
    } catch {
      /* use defaults */
    }
    const models =
      Array.isArray(saved.models) && saved.models.length === 3
        ? saved.models
        : config.models;
    const instructions =
      Array.isArray(saved.instructions) && saved.instructions.length === 3
        ? saved.instructions
        : config.instructions;
    models.forEach((model, index) => {
      $(`#model-${index}`).value = model;
    });
    instructions.forEach((instruction, index) => {
      $(`#instruction-${index}`).value = instruction;
    });
    $("#alternatives-per-pair").value = String(saved.alternativesPerPair || 1);
    updateRedraftCost();
    if (config.configured) {
      $("#openrouter-key-field").hidden = true;
      redraftStatus.textContent =
        "OpenRouter key loaded from the museum server environment.";
    } else {
      $("#openrouter-key-field").hidden = false;
      redraftStatus.textContent =
        "Enter your OpenRouter API key to generate drafts. It is not saved.";
    }
  } catch (error) {
    redraftStatus.textContent = `Could not load redraft settings: ${error.message}`;
  }
}

function updateRedraftCost() {
  const count = Number($("#alternatives-per-pair").value);
  $("#redraft-cost").textContent =
    `9 OpenRouter requests · up to ${9 * count} drafts. The snippet is sent to the chosen models; your OpenRouter account is charged for usage.`;
}

function draftGroup(result) {
  const section = element("section", "draft-group");
  section.append(
    element(
      "h3",
      "",
      `${result.model} · instruction ${result.instructionIndex + 1}`,
    ),
  );
  section.append(element("p", "", result.instruction));
  if (result.error) {
    section.append(element("p", "", `Could not generate: ${result.error}`));
    return section;
  }
  for (const proposal of result.alternatives || []) {
    const option = element("div", "draft-option");
    const field = element("textarea", "mb-control");
    field.value = proposal.text;
    field.setAttribute(
      "aria-label",
      `Draft by ${result.model}, instruction ${result.instructionIndex + 1}`,
    );
    option.append(field);
    const actions = element("div", "draft-actions");
    const copy = button("Copy", "copy-draft");
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(field.value);
      copy.textContent = "Copied";
    });
    actions.append(copy);
    if (proposal.approvable) {
      const approve = button("Approve and save", "approve-draft", "outline");
      approve.addEventListener("click", () =>
        approveDraft(proposal.id, field.value),
      );
      actions.append(approve);
    } else {
      actions.append(element("span", "", "Manual source edit needed"));
    }
    option.append(actions);
    section.append(option);
  }
  return section;
}

async function approveDraft(proposalId, proposedText) {
  redraftStatus.textContent =
    "Saving approved wording and invalidating translations…";
  try {
    const response = await fetch("/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId, text: proposedText }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || `HTTP ${response.status}`);
    redraftStatus.textContent = result.key
      ? `Saved ${result.key} in ${result.file}. Removed ${result.invalidated.length} translations: ${result.invalidated.join(", ") || "none present"}.`
      : `Saved the approved wording in ${result.file}.`;
    for (const button of redraftResults.querySelectorAll(
      '[data-action="approve-draft"]',
    ))
      button.disabled = true;
    const catalogue = await fetch("/catalogue.json");
    if (catalogue.ok) {
      records = await catalogue.json();
      render();
    }
  } catch (error) {
    redraftStatus.textContent = `Could not approve: ${error.message}`;
  }
}

$("#redraft-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentDraftRecord) return;
  const settings = redraftFields();
  localStorage.setItem(redraftStorageKey, JSON.stringify(settings));
  redraftStatus.textContent =
    "Generating nine model and instruction pairs. This can take a few minutes…";
  redraftResults.replaceChildren();
  const run = $("#run-redraft");
  run.disabled = true;
  try {
    const response = await fetch("/redraft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordId: currentDraftRecord.id,
        apiKey: $("#openrouter-key").value,
        ...settings,
      }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || `HTTP ${response.status}`);
    for (const pair of result.results) redraftResults.append(draftGroup(pair));
    const success = result.results.reduce(
      (sum, pair) => sum + (pair.alternatives?.length || 0),
      0,
    );
    redraftStatus.textContent = `${success} drafts received from nine model and instruction pairs.`;
  } catch (error) {
    redraftStatus.textContent = `Could not redraft: ${error.message}`;
  } finally {
    run.disabled = false;
  }
});
$("#alternatives-per-pair").addEventListener("change", updateRedraftCost);
$("#close-redraft").addEventListener("click", () => redraftDialog.close());

for (const control of [search, area, topic, strong, yappingLimit]) {
  control.addEventListener(control === search ? "input" : "change", () => {
    shown = 60;
    render();
  });
}
for (const control of document.querySelectorAll("[data-view]")) {
  control.addEventListener("click", () => {
    view = control.dataset.view;
    $("#yapping-field").hidden = view !== "yapping";
    shown = 60;
    for (const candidate of document.querySelectorAll("[data-view]")) {
      candidate.setAttribute("aria-pressed", String(candidate === control));
    }
    render();
  });
}
more.addEventListener("click", () => {
  shown += 60;
  render();
});
$("#clear").addEventListener("click", () => {
  search.value = "";
  area.value = "";
  topic.value = "";
  strong.value = "";
  yappingLimit.value = "160";
  shown = 60;
  render();
  search.focus();
});
$("#close-dialog").addEventListener("click", () => dialog.close());
$("#copy-location").addEventListener("click", async () => {
  if (!currentSource) return;
  await navigator.clipboard.writeText(
    `${currentSource.file}:${currentSource.line}`,
  );
  $("#copy-location").textContent = "Copied";
  setTimeout(() => {
    $("#copy-location").textContent = "Copy location";
  }, 1500);
});

try {
  const response = await fetch("/catalogue.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  records = await response.json();
  const areas = [...new Set(records.map((record) => record.area))].sort();
  for (const name of areas) {
    const option = element("option", "", name);
    option.value = name;
    area.append(option);
  }
  for (const word of strongWords) {
    const count = records.filter((record) =>
      new RegExp(`\\b${word}\\b`, "i").test(record.text),
    ).length;
    const option = element("option", "", `${word} (${count.toLocaleString()})`);
    option.value = word;
    strong.append(option);
  }
  const eyebrows = records.filter((record) => record.kind === "eyebrow").length;
  const review = records.filter((record) => record.review.length).length;
  $("#summary").textContent =
    `${records.length.toLocaleString()} strings · ${eyebrows.toLocaleString()} eyebrows · ${review.toLocaleString()} review prompts`;
  render();
} catch (error) {
  $("#summary").textContent = "Could not load source";
  cards.append(
    element("div", "empty", `Catalogue failed to load: ${error.message}`),
  );
}
