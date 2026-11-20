import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { buildCatalogue, sourceExcerpt } from "./catalogue.mjs";
import { sourceHash } from "./source-edit.mjs";
import { canApprove, saveApproval, sourcePath } from "./approval.mjs";
import {
  DEFAULT_INSTRUCTIONS,
  DEFAULT_MODELS,
  redraftAcrossPairs,
  validateRedraftSettings,
} from "./redraft.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT || 4177);
const proposals = new Map();
let redraftBusy = false;
const assets = new Map([
  ["/", ["musueum/index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["musueum/app.js", "text/javascript; charset=utf-8"]],
  ["/museum.css", ["musueum/museum.css", "text/css; charset=utf-8"]],
  [
    "/design/tokens.css",
    ["design_system/tokens.css", "text/css; charset=utf-8"],
  ],
  [
    "/design/button.css",
    ["ui/src/app/design-system/button/button.css", "text/css; charset=utf-8"],
  ],
  [
    "/design/field.css",
    ["ui/src/app/design-system/field/field.css", "text/css; charset=utf-8"],
  ],
]);

function respond(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(body);
}

function json(response, status, value) {
  return respond(
    response,
    status,
    JSON.stringify(value),
    "application/json; charset=utf-8",
  );
}

async function readJson(request) {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw new Error("Expected a JSON request.");
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65536) throw new Error("Request is too large.");
  }
  return JSON.parse(body);
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  try {
    if (request.method === "POST") {
      if (
        request.headers.origin &&
        request.headers.origin !== `http://127.0.0.1:${PORT}`
      )
        return json(response, 403, {
          error: "Requests must come from this local museum.",
        });
      const body = await readJson(request);
      if (url.pathname === "/redraft") {
        const apiKey = process.env.OPENROUTER_API_KEY || body.apiKey;
        if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 300)
          return json(response, 400, {
            error:
              "Enter an OpenRouter API key, or set OPENROUTER_API_KEY before starting the museum.",
          });
        if (redraftBusy)
          return json(response, 409, {
            error: "A redraft is already running.",
          });
        const settings = validateRedraftSettings(body);
        const record = buildCatalogue().find(
          (item) => item.id === body.recordId,
        );
        if (!record)
          return json(response, 404, {
            error: "Snippet has changed; refresh the page.",
          });
        const original = readFileSync(sourcePath(record, ROOT), "utf8");
        const hash = sourceHash(original);
        redraftBusy = true;
        try {
          const results = await redraftAcrossPairs(
            record,
            settings,
            apiKey.trim(),
          );
          for (const result of results) {
            result.alternatives = result.alternatives?.map((text) => {
              const id = randomUUID();
              proposals.set(id, { record, sourceHash: hash });
              return {
                id,
                text,
                approvable: canApprove(record, ROOT),
              };
            });
          }
          while (proposals.size > 500)
            proposals.delete(proposals.keys().next().value);
          return json(response, 200, {
            results,
            source: { file: record.file, line: record.line, key: record.key },
          });
        } finally {
          redraftBusy = false;
        }
      }
      if (url.pathname === "/approve") {
        const proposal = proposals.get(body.proposalId);
        if (!proposal)
          return json(response, 404, {
            error: "Draft expired; redraft the snippet.",
          });
        const saved = saveApproval(proposal, body.text, ROOT);
        for (const [id, pending] of proposals) {
          if (pending.record.file === proposal.record.file)
            proposals.delete(id);
        }
        return json(response, 200, saved);
      }
      return json(response, 404, { error: "Unknown endpoint." });
    }
    if (request.method !== "GET")
      return respond(response, 405, "Method not allowed");
    if (url.pathname === "/redraft-config")
      return json(response, 200, {
        configured: Boolean(process.env.OPENROUTER_API_KEY),
        models: DEFAULT_MODELS,
        instructions: DEFAULT_INSTRUCTIONS,
      });
    if (url.pathname === "/catalogue.json") {
      return respond(
        response,
        200,
        JSON.stringify(buildCatalogue()),
        "application/json; charset=utf-8",
      );
    }
    if (url.pathname === "/excerpt.json") {
      const excerpt = sourceExcerpt(
        url.searchParams.get("file") || "",
        Number(url.searchParams.get("line")),
      );
      return excerpt
        ? respond(
            response,
            200,
            JSON.stringify(excerpt),
            "application/json; charset=utf-8",
          )
        : respond(response, 404, "Source not found");
    }
    const asset = assets.get(url.pathname);
    if (!asset) return respond(response, 404, "Not found");
    return respond(response, 200, readFileSync(join(ROOT, asset[0])), asset[1]);
  } catch (error) {
    console.error(error);
    return json(response, error instanceof SyntaxError ? 400 : 422, {
      error: error.message || "Request failed.",
    });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Museum: http://127.0.0.1:${PORT}`);
});
