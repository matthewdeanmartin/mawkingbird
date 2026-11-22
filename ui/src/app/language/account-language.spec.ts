import { describe, expect, it } from 'vitest';
import { Account, Status } from '../platform/api/models';
import { inferAccountLanguages, MS_ID, writesIn } from './account-language';
import { seedWordsFor } from './seed-words';

function account(id = 'a', note = ''): Account {
  return { id, acct: id, username: id, note, fields: [] } as unknown as Account;
}

let n = 0;
function post(a: Account, language: string | null, text: string, reblog: Status | null = null) {
  return {
    id: `p${++n}`,
    account: a,
    language,
    content: `<p>${text}</p>`,
    reblog,
  } as unknown as Status;
}

// The detector is conservative: it only names a language when no other
// language's common words appear. This sentence it reads as Indonesian (it has
// no Malay); everyday Malay with "di" or "dan" it leaves undetermined.
const MALAY = 'Mereka tidak bisa datang karena sudah terlambat juga';
const ENGLISH = 'The weather is lovely today and I went for a long walk with the dog';
const GERMAN = 'Heute ist das Wetter sehr schön und ich gehe mit dem Hund spazieren';

describe('inferAccountLanguages', () => {
  it('counts a post’s tag, one vote per post', () => {
    const a = account();
    const langs = inferAccountLanguages(a, [
      post(a, 'eo', 'Saluton'),
      post(a, 'eo', 'Bonan tagon'),
    ]);
    expect(langs.primary).toBe('eo');
    expect(langs.votes).toBe(2);
  });

  it('trusts confident detection over a default-looking tag', () => {
    const a = account();
    const langs = inferAccountLanguages(a, [post(a, 'en', GERMAN), post(a, 'en', GERMAN)]);
    expect(langs.primary).toBe('de');
  });

  it('keeps detected Malay/Indonesian undecided unless the person’s tags settle it', () => {
    const a = account();
    expect(inferAccountLanguages(a, [post(a, null, MALAY)]).primary).toBe(MS_ID);
    expect(inferAccountLanguages(a, [post(a, 'ms', MALAY), post(a, null, MALAY)]).primary).toBe(
      'ms',
    );
    expect(inferAccountLanguages(a, [post(a, 'id', MALAY)]).primary).toBe('id');
  });

  it('reads the bio, and ignores boosts and other people’s posts', () => {
    const a = account('a', `<p>${ENGLISH}</p>`);
    const b = account('b');
    const langs = inferAccountLanguages(a, [
      post(b, 'de', GERMAN),
      post(a, null, '', post(b, 'de', GERMAN)),
    ]);
    expect(langs.primary).toBe('en');
    expect(langs.votes).toBe(1);
  });

  it('knows nothing from nothing', () => {
    expect(inferAccountLanguages(account())).toEqual({ shares: [], primary: null, votes: 0 });
  });
});

describe('writesIn', () => {
  it('needs a quarter of the evidence, and lets undecided Malay/Indonesian match either', () => {
    const a = account();
    const mostly = inferAccountLanguages(a, [
      post(a, 'eo', 'x'),
      post(a, 'eo', 'y'),
      post(a, 'eo', 'z'),
      post(a, 'en', ENGLISH),
    ]);
    expect(writesIn(mostly, 'eo')).toBe(true);
    expect(writesIn(mostly, 'en')).toBe(true);
    expect(writesIn(mostly, 'de')).toBe(false);
    const undecided = inferAccountLanguages(a, [post(a, null, MALAY)]);
    expect(writesIn(undecided, 'ms')).toBe(true);
    expect(writesIn(undecided, 'id')).toBe(true);
  });
});

describe('seedWordsFor', () => {
  it('has common words for Malay and Indonesian, and nothing for unknown languages', () => {
    expect(seedWordsFor('ms')[0]).toBe('yang');
    expect(seedWordsFor('id-ID').length).toBeGreaterThan(3);
    expect(seedWordsFor('kw')).toEqual([]);
  });
});
