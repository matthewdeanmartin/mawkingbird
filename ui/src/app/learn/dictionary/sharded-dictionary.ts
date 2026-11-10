import {
  DictAttribution,
  DictEntry,
  DictionarySource,
  DictManifest,
  dictionaryShard,
} from './dictionary';

/** An entry as `scripts/build-dictionaries.mjs` writes it. */
interface CompactEntry {
  w: string[];
  r: string[];
  s: { p: string[]; g: string[]; m?: string[] }[];
  c?: 1;
}

/** One shard file: entries once (`e`), and each key's entry positions (`k`). */
interface Shard {
  e: CompactEntry[];
  k: Record<string, number[]>;
}

function expand(entry: CompactEntry): DictEntry {
  return {
    forms: entry.w,
    readings: entry.r,
    senses: entry.s.map((sense) => ({ pos: sense.p, glosses: sense.g, misc: sense.m ?? [] })),
    common: entry.c === 1,
  };
}

/**
 * A dictionary served as static shards under `dict/<id>/` beside the app:
 * a manifest, then one file per bucket of first characters, fetched the
 * first time a word starting with one of them is looked up and kept for the
 * visit (the browser's HTTP cache keeps it after that).
 */
export class ShardedDictionary implements DictionarySource {
  private manifestLoad: Promise<DictManifest> | null = null;
  private shards = new Map<number, Promise<Shard>>();

  constructor(
    readonly id: string,
    readonly language: string,
    readonly attribution: DictAttribution,
    /** Overridable in tests. */
    private readonly fetchJson: (url: string) => Promise<unknown> = defaultFetchJson,
  ) {}

  manifest(): Promise<DictManifest> {
    this.manifestLoad ??= this.fetchJson(this.url('manifest.json')).then(
      (manifest) => manifest as DictManifest,
      (err: unknown) => {
        // Let a later lookup try again (offline, a deploy in progress).
        this.manifestLoad = null;
        throw err;
      },
    );
    return this.manifestLoad;
  }

  async lookup(word: string): Promise<DictEntry[]> {
    if (!word) return [];
    const { shards } = await this.manifest();
    const shard = await this.shard(dictionaryShard(word, shards));
    return (shard.k[word] ?? []).map((index) => expand(shard.e[index]));
  }

  async describeTag(tag: string): Promise<string> {
    try {
      return (await this.manifest()).tags[tag] ?? tag;
    } catch {
      return tag;
    }
  }

  private shard(index: number): Promise<Shard> {
    let load = this.shards.get(index);
    if (!load) {
      load = this.fetchJson(this.url(`${index}.json`)).then(
        (shard) => shard as Shard,
        (err: unknown) => {
          this.shards.delete(index);
          throw err;
        },
      );
      this.shards.set(index, load);
    }
    return load;
  }

  private url(file: string): string {
    return new URL(`dict/${this.id}/${file}`, document.baseURI).href;
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Dictionary file unavailable (HTTP ${response.status}).`);
  return response.json();
}
