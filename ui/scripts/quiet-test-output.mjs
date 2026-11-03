/**
 * Run a command, streaming its output, minus the Angular build's chunk table.
 *
 * `ng test` builds the app before Vitest runs and prints a size table for
 * every test bundle: about 1,500 lines per full run, none of which says
 * anything about the tests. It buried failures in terminal scrollback and CI
 * logs, and cost agents reading the output most of their context. Everything
 * else (Vitest progress, failures, coverage summary) passes through live.
 *
 * Set VERBOSE=1 to see the table.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const ANSI = /\x1b\[[0-9;]*m/g;
/** A chunk-table row or its headers: "name | label | 12.3 kB |". */
const TABLE_ROW = /\|\s*[\d.]+ (?:bytes|kB|MB)\s*\|?\s*$/;
const TABLE_HEADER = /^\s*(?:Initial chunk files|Lazy chunk files|Initial total)\b/;
const TABLE_MORE = /^\s*\.\.\.and \d+ more lazy chunks? files/;

export function isChunkTableLine(line) {
  const plain = line.replace(ANSI, '');
  return TABLE_ROW.test(plain) || TABLE_HEADER.test(plain) || TABLE_MORE.test(plain);
}

/** Spawn and resolve with the exit status; hidden lines are counted, not lost silently. */
export function runQuietly(command, args, options = {}) {
  if (process.env.VERBOSE) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { ...options, stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    });
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['inherit', 'pipe', 'pipe'] });
    let hidden = 0;
    const pass = (stream, sink) =>
      createInterface({ input: stream, crlfDelay: Infinity }).on('line', (line) => {
        if (isChunkTableLine(line)) {
          hidden++;
          return;
        }
        sink.write(`${line}\n`);
      });
    pass(child.stdout, process.stdout);
    pass(child.stderr, process.stderr);
    child.on('error', reject);
    child.on('close', (code) => {
      if (hidden) {
        process.stdout.write(
          `(${hidden} lines of build chunk sizes hidden; run with VERBOSE=1 to see them)\n`,
        );
      }
      resolve(code ?? 1);
    });
  });
}
