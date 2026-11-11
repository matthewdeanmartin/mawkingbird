import { LanguageDictionary, NO_DEINFLECTION } from '../dictionary';
import { DictionaryHost, ShardedDictionary } from '../sharded-dictionary';

/**
 * Chinese: CC-CEDICT from MDBG, simplified and traditional headwords with
 * pinyin. CC BY-SA 4.0. Chinese does not inflect, so lookup is longest match
 * only. The data is built from a hand-downloaded file (`npm run dict:cedict`);
 * until it has been, lookups say the dictionary is not available.
 */
export function chinese(host: DictionaryHost): LanguageDictionary {
  return {
    language: 'zh',
    source: new ShardedDictionary(
      'cc-cedict',
      'zh',
      {
        name: 'CC-CEDICT',
        publisher: 'MDBG',
        licence: 'CC BY-SA 4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        projectUrl: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
      },
      host,
    ),
    deinflector: NO_DEINFLECTION,
    maxWordLength: 8,
    moreUrl: (word) => `https://www.mdbg.net/chinese/dictionary?wdqb=${encodeURIComponent(word)}`,
  };
}
