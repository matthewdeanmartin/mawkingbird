/**
 * Vendor GoatCounter's count.js into `public/vendor/` at build time.
 *
 * Why this exists: a third-party script tag is a standing grant of full access
 * to this origin — and this origin's localStorage holds Mastodon tokens,
 * Bluesky JWTs and connector credentials. Loading `gc.zgo.at/count.js` at
 * runtime means whoever controls that hostname *today* can read all of it. The
 * failure mode that matters is not GoatCounter being malicious; it is
 * GoatCounter going away and the domain being re-registered by someone else.
 * A lapsed analytics domain is a very cheap way to buy a lot of credentials.
 *
 * Serving our own copy means `script-src 'self'` — no third-party origin can
 * execute here at all, and a hostname changing hands is a non-event.
 *
 * The cost of vendoring is staleness, which this script exists to pay: it
 * refetches on every build, prints the hash, and writes the file only when the
 * content actually changed — so an upstream change shows up as a reviewable
 * diff in git rather than silently, and the reviewable diff is the point.
 *
 * Network failures do not fail the build: an offline or CI-sandboxed build
 * keeps the committed copy and warns. The build only fails if there is no copy
 * at all, because then the page would 404 on a script it references.
 *
 * Runs automatically via the `prebuild` / `prebuild:mockingbird` npm hooks.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = join(ROOT, 'public', 'vendor');
const TARGET = join(VENDOR_DIR, 'count.js');

const SOURCE = 'https://gc.zgo.at/count.js';
const TIMEOUT_MS = 10_000;
/** A truncated file would break analytics silently; count.js is ~4 KB. */
const MIN_PLAUSIBLE_BYTES = 500;

function sha256(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function banner(text) {
  return (
    `/*\n` +
    ` * VENDORED THIRD-PARTY FILE - DO NOT EDIT BY HAND.\n` +
    ` *\n` +
    ` * Source:    ${SOURCE}\n` +
    ` * Retrieved: ${new Date().toISOString()}\n` +
    ` * sha256:    ${sha256(text)} (of the body below, this header excluded)\n` +
    ` *\n` +
    ` * Refreshed by scripts/vendor-analytics.mjs on every build. Served from our\n` +
    ` * own origin so the page can keep script-src 'self' - see docs/security.md.\n` +
    ` * Review changes to this file like any other dependency bump.\n` +
    ` */\n`
  );
}

/** The vendored body without our header, for comparing against a fresh fetch. */
function existingBody() {
  if (!existsSync(TARGET)) {
    return null;
  }
  const text = readFileSync(TARGET, 'utf8');
  const end = text.indexOf('*/\n');
  return text.startsWith('/*') && end !== -1 ? text.slice(end + 3) : text;
}

async function fetchUpstream() {
  const response = await fetch(SOURCE, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = await response.text();
  if (body.length < MIN_PLAUSIBLE_BYTES) {
    throw new Error(`suspiciously small response (${body.length} bytes)`);
  }
  return body;
}

/**
 * Deliberately returns rather than calling `process.exit()`.
 *
 * `fetch`'s abort timer and socket are still registered with libuv when this
 * finishes; tearing the process down out from under them crashes Node on
 * Windows with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, which
 * then takes the build with it. Setting `exitCode` and letting the event loop
 * drain naturally is both correct and quieter.
 */
async function main() {
  const previous = existingBody();

  let fresh;
  try {
    fresh = await fetchUpstream();
  } catch (error) {
    if (previous === null) {
      console.error(
        `\nCould not fetch ${SOURCE} (${error.message}) and there is no vendored copy.\n` +
          `The page references vendor/count.js, so the build would ship a 404.\n` +
          `Connect to the network once, or remove the analytics script tag from index.html.\n`,
      );
      process.exitCode = 1;
      return;
    }
    console.warn(
      `analytics: could not refresh count.js (${error.message}) - keeping vendored copy ${sha256(previous)}`,
    );
    return;
  }

  if (previous !== null && previous === fresh) {
    console.log(`analytics: count.js unchanged (${sha256(fresh)})`);
    return;
  }

  mkdirSync(VENDOR_DIR, { recursive: true });
  writeFileSync(TARGET, banner(fresh) + fresh, 'utf8');
  console.log(
    previous === null
      ? `analytics: vendored count.js (${sha256(fresh)})`
      : `analytics: count.js CHANGED ${sha256(previous)} -> ${sha256(fresh)} - review the diff`,
  );
}

await main();
