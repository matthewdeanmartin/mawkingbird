#!/usr/bin/env node
// Import the Fedicensus jurisdiction evidence (https://fedicensus.org/data/,
// CC BY 4.0) that the report gate falls back on. The client ships this copy and
// never contacts fedicensus.org.
//
//   node scripts/import-fedicensus.mjs            download and import
//   node scripts/import-fedicensus.mjs <dir>      import from already downloaded CSVs
//
// Only what a server's own policies say, and who registered its domain, is
// kept. Hosting location, domain suffix, language and third-party tracker
// claims are dropped: they say where a machine is, not whose law applies.
// Fedicensus matches words, so this also drops the entity names its matching
// gets wrong: hosting and payment companies, sentence fragments, and Mastodon's
// own company on servers that only mention it.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ui, 'src/app/moderation/jurisdiction/fedicensus.generated.json');
const BASE = 'https://fedicensus.org/data';
const LINKS = 'jurisdiction-links.csv';
const CENSUS = 'fediverse-census.csv';

/** Software a reader can be signed in to here, so a report can reach its moderators. */
const SOFTWARE = new Set([
  'mastodon',
  'glitchcafe',
  'hometown',
  'fedibird',
  'pleroma',
  'akkoma',
  'gotosocial',
  'pixelfed',
  'friendica',
  'misskey',
  'sharkey',
  'firefish',
  'iceshrimp',
  'iceshrimp.net',
]);

/** Words fedicensus counts as naming a country that are laws, as they are usually written. */
const LAWS = new Map(
  [
    'DMCA',
    'COPPA',
    'TMG',
    'DSA',
    'Digital Services Act',
    'Online Safety Act',
    'UK GDPR',
    'Data Protection Act 2018',
    'NetzDG',
    'LCEN',
  ].map((law) => [law.toLowerCase(), law]),
);

const VENDORS =
  /hetzner|netcup|strato|ip-projects|contabo|scaleway|amazon|digitalocean|cloudflare|fastly|backblaze|google|microsoft|apple|facebook|stripe|paypal|ko-fi|proton|fastmail|mailjet|rocket science|automattic|a8c|xing|niantic|withers|t-systems|windcloud|mythic beasts|andrews & arnold|opalstack|open ?collective|handelsregister/i;
const MASTODON_OWN = new Set(['mastodon.social', 'mastodon.online']);
/** Lower-case words that occur inside organisation names; any other one means a sentence. */
const NAME_WORDS = new Set([
  'of',
  'and',
  'for',
  'für',
  'und',
  'de',
  'der',
  'e.v',
  'e.',
  'gemeinnützige',
]);
const LEGAL_FORM =
  /^(GmbH|gGmbH|UG|AG|Inc|LLC|LLP|Ltd|Limited|SAS|SARL|ASBL|CIC|BV|B\.V|e\.V|e\.|V|Stichting)$/;

/** An organisation's name, or null when the match is not plainly one. */
export function entityName(raw, host) {
  const name = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/e\. V$/, 'e.V')
    .replace(/e\.V$/, 'e.V.');
  if (VENDORS.test(name)) return null;
  if (/mastodon/i.test(name) && !(MASTODON_OWN.has(host) && /^Mastodon g?GmbH$/.test(name)))
    return null;
  const words = name.split(' ');
  if (words.some((w) => /^\p{Ll}/u.test(w) && !NAME_WORDS.has(w.replace(/\.$/, '').toLowerCase())))
    return null;
  if (/^(Der|Die|Das|The|This|Wir|We|It|Unser|Server|Verein|Rechtsform|Instanz)\b/.test(name))
    return null;
  // A legal form alone, or with one generic word, is not a name.
  const proper = words.filter((w) => !LEGAL_FORM.test(w.replace(/\.$/, '')) && w !== 'e.V.');
  if (
    !proper.length ||
    /^(Labs|Networks|Massachusetts|Deutschland|IT|Medien)$/.test(proper.join(' '))
  )
    return null;
  return name;
}

/** RFC 4180: quoted fields may hold commas, quotes and line breaks. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ''])));
}

export function build(links, census) {
  const software = new Map(census.map((row) => [row.domain, row.software]));
  const date = census[0]?.scored_at?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('no census date');
  const found = new Map();
  const add = (host, kind, value) => {
    if (!found.has(host)) found.set(host, { places: new Set(), laws: new Set(), names: new Set() });
    found.get(host)[kind].add(value);
  };
  for (const { domain, country, basis, reason } of links) {
    if (!SOFTWARE.has(software.get(domain))) continue;
    if (!/^[a-z0-9.-]+$/.test(domain)) continue;
    const quoted = /"([\s\S]*)"/.exec(reason)?.[1];
    if (basis === 'declared' && quoted) {
      const law = LAWS.get(quoted.toLowerCase());
      if (law) add(domain, 'laws', law === 'DSA' ? 'Digital Services Act' : law);
      else if (/^[A-Z]{2}$/.test(country) && quoted.toLowerCase() !== 'first amendment')
        add(domain, 'places', country);
    } else if (basis === 'operator' && quoted) {
      const name = entityName(quoted, domain);
      if (name) add(domain, 'names', name);
    }
  }
  const servers = {};
  for (const host of [...found.keys()].sort()) {
    const { places, laws, names } = found.get(host);
    servers[host] = {
      ...(places.size ? { places: [...places].sort() } : {}),
      ...(laws.size ? { laws: [...laws].sort() } : {}),
      ...(names.size ? { names: [...names].sort() } : {}),
    };
  }
  return {
    $comment:
      'GENERATED by ui/scripts/import-fedicensus.mjs. Adapted from the Fediverse jurisdiction census, https://fedicensus.org/data/, by Data Torturing Solutions, CC BY 4.0. Do not edit by hand.',
    date,
    servers,
  };
}

async function read(dir, name) {
  if (dir) return readFileSync(join(dir, name), 'utf8');
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.text();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  const out = build(parseCsv(await read(dir, LINKS)), parseCsv(await read(dir, CENSUS)));
  const count = Object.keys(out.servers).length;
  // A truncated or redesigned download must not empty the shipped copy.
  if (count < 500 || !out.servers['mastodon.social'])
    throw new Error(`only ${count} servers, or mastodon.social is missing: not written`);
  // One server per line: a refresh reads as a diff.
  const lines = Object.entries(out.servers).map(
    ([host, record]) => `    ${JSON.stringify(host)}: ${JSON.stringify(record)}`,
  );
  writeFileSync(
    OUT,
    `{\n  "$comment": ${JSON.stringify(out.$comment)},\n  "date": "${out.date}",\n  "servers": {\n${lines.join(',\n')}\n  }\n}\n`,
  );
  console.log(`Wrote ${count} servers (census of ${out.date}).`);
}
