/** Offline audit: curated outcomes, English UI prose, and a local timing sample. */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('src/app/language-detect.ts', root), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { detectLanguage } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
const corpus = JSON.parse(
  readFileSync(new URL('src/app/language-detect.corpus.json', root), 'utf8'),
);
let failures = 0;
for (const { lang, text } of corpus) {
  const variants = lang === 'und' ? [text] : [text, text.normalize('NFD'), text.toUpperCase()];
  for (const variant of variants) {
    const got = detectLanguage(variant);
    if (got.length !== 1 || got[0].lang !== lang) {
      console.error({ expected: lang, text: variant, got });
      failures++;
    }
  }
}

function strings(value) {
  return Object.values(value).flatMap((item) =>
    typeof item === 'string' ? [item] : strings(item),
  );
}
const english = strings(
  JSON.parse(readFileSync(new URL('public/i18n/en.json', root), 'utf8')),
).filter((text) => text.split(/\s+/).length >= 12);
const englishCounts = { english: 0, unknown: 0, foreign: 0 };
for (const text of english) {
  const [top] = detectLanguage(text);
  englishCounts[top.lang === 'en' ? 'english' : top.lang === 'und' ? 'unknown' : 'foreign']++;
}

const timings = [];
for (let i = 0; i < 3000; i++) {
  const started = performance.now();
  detectLanguage(corpus[i % corpus.length].text);
  timings.push(performance.now() - started);
}
timings.sort((a, b) => a - b);
const started = performance.now();
detectLanguage('Unrecognized repeated content '.repeat(10000));
console.log(
  JSON.stringify(
    {
      corpus: fileURLToPath(new URL('src/app/language-detect.corpus.json', root)),
      cases: corpus.length,
      failures,
      englishSample: { count: english.length, ...englishCounts },
      timingMs: {
        p50: timings[1500],
        p95: timings[2850],
        p99: timings[2970],
        oversized: performance.now() - started,
      },
    },
    null,
    2,
  ),
);
process.exitCode = failures ? 1 : 0;
