import { beforeEach, describe, expect, it } from 'vitest';
import { dictionaryFor, forgetLoadedDictionaries, hasDictionary } from './dictionary-registry';

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
