import { LanguageDictionary } from '../dictionary';
import { DictionaryHost, ShardedDictionary } from '../sharded-dictionary';
import { JAPANESE_DEINFLECTOR } from './japanese-deinflect';

/**
 * Japanese: JMdict (common words, English glosses) from the Electronic
 * Dictionary Research and Development Group, via jmdict-simplified.
 * CC BY-SA 4.0; the EDRDG licence asks for acknowledgement on every screen
 * that shows an entry, which the lookup popup's footer does.
 */
export function japanese(host: DictionaryHost): LanguageDictionary {
  return {
    language: 'ja',
    source: new ShardedDictionary(
      'jmdict',
      'ja',
      {
        name: 'JMdict',
        publisher: 'Electronic Dictionary Research and Development Group',
        licence: 'CC BY-SA 4.0',
        licenceUrl: 'https://www.edrdg.org/edrdg/licence.html',
        projectUrl: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
      },
      host,
    ),
    deinflector: JAPANESE_DEINFLECTOR,
    maxWordLength: 16,
    moreUrl: (word) => `https://jisho.org/search/${encodeURIComponent(word)}`,
  };
}
