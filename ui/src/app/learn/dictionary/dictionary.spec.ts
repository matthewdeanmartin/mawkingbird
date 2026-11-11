import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DictEntry, dictionaryShard, LanguageDictionary, NO_DEINFLECTION } from './dictionary';
import { dictionaryFor, forgetLoadedDictionaries, hasDictionary } from './dictionary-registry';
import { JAPANESE_DEINFLECTOR } from './languages/japanese-deinflect';
import { ShardedDictionary } from './sharded-dictionary';
import { lookupAt, segmentWords } from './word-lookup';

/** A few JMdict-shaped entries, sharded the way the build script does it. */
const ENTRIES = [
  { w: ['食べる'], r: ['たべる'], s: [{ p: ['v1', 'vt'], g: ['to eat'] }], c: 1 },
  { w: ['食'], r: ['しょく'], s: [{ p: ['n'], g: ['food'] }] },
  { w: ['読む'], r: ['よむ'], s: [{ p: ['v5m', 'vt'], g: ['to read'] }], c: 1 },
  { w: ['勉強'], r: ['べんきょう'], s: [{ p: ['n', 'vs', 'vt'], g: ['study'] }], c: 1 },
  { w: ['高い'], r: ['たかい'], s: [{ p: ['adj-i'], g: ['high', 'tall'] }], c: 1 },
  { w: ['猫'], r: ['ねこ'], s: [{ p: ['n'], g: ['cat'] }], c: 1 },
  { w: ['為る'], r: ['する'], s: [{ p: ['vs-i'], g: ['to do'], m: ['uk'] }], c: 1 },
  // A noun spelled like an inflected verb: must not match 食べる's forms.
  { w: [], r: ['たべ'], s: [{ p: ['n'], g: ['(made-up noun)'] }] },
];
const SHARDS = 8;

function files(): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'manifest.json': {
      id: 'test',
      language: 'ja',
      version: 't',
      date: null,
      commonOnly: true,
      entries: ENTRIES.length,
      shards: SHARDS,
      licence: 'CC BY-SA 4.0',
      tags: { v1: 'Ichidan verb' },
    },
  };
  const shards = Array.from({ length: SHARDS }, () => ({
    e: [] as unknown[],
    k: {} as Record<string, number[]>,
  }));
  for (const entry of ENTRIES) {
    for (const key of new Set([...entry.w, ...entry.r])) {
      const shard = shards[dictionaryShard(key, SHARDS)];
      let index = shard.e.indexOf(entry);
      if (index < 0) index = shard.e.push(entry) - 1;
      (shard.k[key] ??= []).push(index);
    }
  }
  shards.forEach((shard, n) => (out[`${n}.json`] = shard));
  return out;
}

function japanese(fetchJson = vi.fn(async (url: string) => files()[url.split('/').pop()!])) {
  const dictionary: LanguageDictionary = {
    language: 'ja',
    source: new ShardedDictionary(
      'test',
      'ja',
      {
        name: 'Test',
        publisher: 'Test',
        licence: 'CC BY-SA 4.0',
        licenceUrl: '',
        projectUrl: '',
      },
      fetchJson,
    ),
    deinflector: JAPANESE_DEINFLECTOR,
    maxWordLength: 16,
    moreUrl: () => null,
  };
  return { dictionary, fetchJson };
}

const firstForm = (entry: DictEntry) => entry.forms[0] ?? entry.readings[0];

describe('Japanese deinflection', () => {
  const bases = (surface: string) => JAPANESE_DEINFLECTOR.deinflect(surface).map((d) => d.word);

  it('undoes chained conjugations', () => {
    expect(bases('食べなかった')).toContain('食べる');
    expect(bases('読んでいます')).toContain('読む');
    expect(bases('勉強しました')).toContain('勉強');
    expect(bases('高くない')).toContain('高い');
    expect(bases('来ませんでした')).toContain('来る');
    expect(bases('させられた')).toContain('する');
  });

  it('records what was undone', () => {
    const found = JAPANESE_DEINFLECTOR.deinflect('食べなかった').find((d) => d.word === '食べる');
    expect(found?.reasons).toEqual(['past', 'negative']);
  });

  it('accepts a deinflected word only of the class the rule produced', () => {
    const verb = {
      forms: ['食べる'],
      readings: [],
      senses: [{ pos: ['v1'], glosses: [], misc: [] }],
      common: true,
    };
    const noun = { ...verb, senses: [{ pos: ['n'], glosses: [], misc: [] }] };
    const past = JAPANESE_DEINFLECTOR.deinflect('食べた').find((d) => d.word === '食べる')!;
    expect(JAPANESE_DEINFLECTOR.accepts(verb, past)).toBe(true);
    expect(JAPANESE_DEINFLECTOR.accepts(noun, past)).toBe(false);
  });
});

describe('Word lookup', () => {
  it('finds the longest word at the tap, through inflection', async () => {
    const { dictionary } = japanese();
    const found = await lookupAt(dictionary, '昨日は食べなかった。', 3);
    expect(found?.surface).toBe('食べなかった');
    expect(firstForm(found!.hits[0].entry)).toBe('食べる');
    expect(found!.hits[0].deinflection.reasons).toEqual(['past', 'negative']);
  });

  it('stops at punctuation and falls back to shorter words', async () => {
    const { dictionary } = japanese();
    const found = await lookupAt(dictionary, '猫が好き', 0);
    expect(found?.surface).toBe('猫');
    expect(await lookupAt(dictionary, '。', 0)).toBeNull();
  });

  it('fetches the manifest once and only the shards it needs', async () => {
    const { dictionary, fetchJson } = japanese();
    await lookupAt(dictionary, '猫', 0);
    await lookupAt(dictionary, '猫', 0);
    const urls = fetchJson.mock.calls.map(([url]) => url.split('/').pop());
    expect(urls.filter((u) => u === 'manifest.json')).toHaveLength(1);
    expect(urls).toContain(`${dictionaryShard('猫', SHARDS)}.json`);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('describes tags from the manifest', async () => {
    const { dictionary } = japanese();
    expect(await dictionary.source.describeTag('v1')).toBe('Ichidan verb');
    expect(await dictionary.source.describeTag('zz')).toBe('zz');
  });

  it('works for an uninflected language with no deinflector', async () => {
    const { dictionary } = japanese();
    const plain = { ...dictionary, deinflector: NO_DEINFLECTION };
    expect((await lookupAt(plain, '食べなかった', 0))?.surface).toBe('食');
  });

  it('segments words with the browser segmenter', () => {
    const tokens = segmentWords('猫が好き。', 'ja');
    expect(tokens.map((t) => t.text).join('')).toBe('猫が好き。');
    expect(tokens.find((t) => t.text === '。')?.word).toBe(false);
  });
});

describe('Dictionary registry', () => {
  // Spec files share one module registry: start from no loaded languages.
  beforeEach(() => forgetLoadedDictionaries());

  it('knows Japanese and Chinese, by bare code, and nothing else yet', () => {
    expect(hasDictionary('ja')).toBe(true);
    expect(hasDictionary('zh-Hant')).toBe(true);
    expect(hasDictionary('ko')).toBe(false);
    expect(hasDictionary(null)).toBe(false);
    expect(dictionaryFor('ko')).toBeNull();
  });

  it('loads a language once', async () => {
    const first = dictionaryFor('ja');
    expect(dictionaryFor('ja-JP')).toBe(first);
    expect((await first!).language).toBe('ja');
  });
});
