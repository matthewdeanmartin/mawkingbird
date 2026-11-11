// Build the word-lookup dictionaries (sprint L1) into public/dict/<source>/.
//
// Each dictionary becomes a manifest plus N shard files keyed by the first
// character of a headword (see `dictionaryShard` in
// src/lib/dictionary/dictionary.ts, which must agree), so a lookup
// fetches one small file, and only when a reader taps a word.
//
//   npm run dict:jmdict                  fetch the latest JMdict (common words,
//                                        English) from jmdict-simplified and build
//   npm run dict:jmdict -- --file <json> build from a downloaded jmdict-eng-*.json
//   npm run dict:cedict -- --file <txt>  build from cedict_1_0_ts_utf-8_mdbg.txt(.gz)
//
// Licences (both CC BY-SA 4.0; the generated files are too, as share-alike
// requires; attribution is shown on every lookup and on the Credits page):
// - JMdict: Electronic Dictionary Research and Development Group,
//   https://www.edrdg.org/edrdg/licence.html . The licence requires regular
//   updates from the latest release: rerun `npm run dict:jmdict` monthly.
// - CC-CEDICT: MDBG, https://www.mdbg.net/chinese/dictionary?page=cc-cedict .
//   MDBG forbids automated downloads, so this script never fetches it: download
//   the file by hand from that page and pass it with --file.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = new URL('../public/dict/', import.meta.url);
const args = process.argv.slice(2);
const which = args[0];
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;

/** Must match `dictionaryShard` in the app. */
function shardOf(word, shards) {
  return (word.codePointAt(0) ?? 0) % shards;
}

function writeDictionary(id, manifest, entries, keysOf) {
  const dir = new URL(`${id}/`, ROOT);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // A shard stores each entry once (`e`) and maps every headword or reading
  // that starts in this shard to entry positions (`k`).
  const shards = Array.from({ length: manifest.shards }, () => ({ e: [], k: {}, at: new Map() }));
  for (const entry of entries) {
    for (const key of new Set(keysOf(entry))) {
      const shard = shards[shardOf(key, manifest.shards)];
      let index = shard.at.get(entry);
      if (index === undefined) {
        index = shard.e.push(entry) - 1;
        shard.at.set(entry, index);
      }
      (shard.k[key] ??= []).push(index);
    }
  }
  let bytes = 0;
  shards.forEach((shard, index) => {
    const json = JSON.stringify({ e: shard.e, k: shard.k });
    bytes += json.length;
    fs.writeFileSync(new URL(`${index}.json`, dir), json);
  });
  fs.writeFileSync(new URL('manifest.json', dir), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `${id}: ${entries.length} entries, ${manifest.shards} shards, ${(bytes / 1e6).toFixed(1)} MB`,
  );
}

function fetchLatestJmdict() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jmdict-'));
  const release = JSON.parse(
    execFileSync('gh', ['api', 'repos/scriptin/jmdict-simplified/releases/latest'], {
      encoding: 'utf8',
    }),
  );
  const asset = release.assets.find((a) => /^jmdict-eng-common-.*\.json\.zip$/.test(a.name));
  if (!asset) throw new Error('No jmdict-eng-common zip in the latest release.');
  execFileSync(
    'gh',
    ['release', 'download', release.tag_name, '-R', 'scriptin/jmdict-simplified', '-p', asset.name],
    { cwd: dir, stdio: 'inherit' },
  );
  execFileSync('unzip', ['-o', '-q', asset.name], { cwd: dir });
  const json = fs.readdirSync(dir).find((f) => f.endsWith('.json'));
  return path.join(dir, json);
}

function buildJmdict(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const used = new Set();
  const entries = data.words.map((word) => {
    const senses = word.sense.map((sense) => {
      sense.partOfSpeech.forEach((tag) => used.add(tag));
      sense.misc.forEach((tag) => used.add(tag));
      return {
        p: sense.partOfSpeech,
        g: sense.gloss.filter((g) => g.lang === 'eng').map((g) => g.text),
        ...(sense.misc.length ? { m: sense.misc } : {}),
      };
    });
    const common = word.kanji.some((k) => k.common) || word.kana.some((k) => k.common);
    return {
      w: word.kanji.map((k) => k.text),
      r: word.kana.map((k) => k.text),
      s: senses,
      ...(common ? { c: 1 } : {}),
    };
  });
  const tags = Object.fromEntries(Object.entries(data.tags).filter(([tag]) => used.has(tag)));
  writeDictionary(
    'jmdict',
    {
      id: 'jmdict',
      language: 'ja',
      version: `jmdict-simplified ${data.version}`,
      date: data.dictDate,
      commonOnly: !!data.commonOnly,
      entries: entries.length,
      shards: 256,
      licence: 'CC BY-SA 4.0',
      tags,
    },
    entries,
    (entry) => [...entry.w, ...entry.r],
  );
}

function buildCedict(file) {
  let text = fs.readFileSync(file);
  if (file.endsWith('.gz')) text = zlib.gunzipSync(text);
  const lines = text.toString('utf8').split(/\r?\n/);
  const date = lines.find((l) => l.startsWith('#! date='))?.slice('#! date='.length) ?? null;
  const entries = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const match = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/.exec(line);
    if (!match) continue;
    const [, traditional, simplified, pinyin, glosses] = match;
    entries.push({
      w: traditional === simplified ? [simplified] : [simplified, traditional],
      r: [pinyin],
      s: [{ p: [], g: glosses.split('/').filter(Boolean) }],
    });
  }
  writeDictionary(
    'cc-cedict',
    {
      id: 'cc-cedict',
      language: 'zh',
      version: 'CC-CEDICT',
      date,
      commonOnly: false,
      entries: entries.length,
      shards: 256,
      licence: 'CC BY-SA 4.0',
      tags: {},
    },
    entries,
    (entry) => entry.w,
  );
}

if (which === 'jmdict') {
  buildJmdict(fileArg ?? fetchLatestJmdict());
} else if (which === 'cedict') {
  if (!fileArg) {
    console.error(
      'Download cedict_1_0_ts_utf-8_mdbg.txt.gz by hand from ' +
        'https://www.mdbg.net/chinese/dictionary?page=cc-cedict (MDBG forbids scripted ' +
        'downloads), then: npm run dict:cedict -- --file <path>',
    );
    process.exit(1);
  }
  buildCedict(fileArg);
} else {
  console.error('Usage: build-dictionaries.mjs jmdict|cedict [--file <path>]');
  process.exit(1);
}
