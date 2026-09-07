import { describe, expect, it } from 'vitest';
import {
  LANG_NAMES,
  LangCode,
  detectLanguage,
  detectLanguageMix,
  detectScriptCandidates,
  detectScriptLanguage,
  sharePct,
} from './language-detect';

/** The top-voted language for a snippet. */
function top(text: string, meta?: string | null): LangCode {
  return detectLanguage(text, meta)[0].lang;
}

describe('detectLanguage — script tier', () => {
  it('detects Japanese from kana', () => {
    expect(top('これはテストです')).toBe('ja');
  });

  it('detects Japanese when kanji mixes with kana', () => {
    expect(top('今日はいい天気ですね')).toBe('ja');
  });

  it('detects Korean from hangul', () => {
    expect(top('안녕하세요 반갑습니다')).toBe('ko');
  });

  it('detects Chinese from han without kana', () => {
    expect(top('这是一个测试')).toBe('zh');
  });

  it('detects Russian from cyrillic', () => {
    expect(top('это простой тест')).toBe('ru');
  });

  it('refines cyrillic to Ukrainian when unique letters appear', () => {
    expect(top('це український текст із літерою ї')).toBe('uk');
  });

  it('detects Greek, Arabic, Hebrew, Thai, Hindi by script', () => {
    expect(top('αυτό είναι ελληνικά')).toBe('el');
    expect(top('هذا نص عربي')).toBe('ar');
    expect(top('זהו טקסט עברי')).toBe('he');
    expect(top('นี่คือข้อความภาษาไทย')).toBe('th');
    expect(top('यह हिंदी पाठ है')).toBe('hi');
  });
});

describe('detectLanguage — Latin stop-word tier', () => {
  it('detects English', () => {
    expect(top('the quick brown fox is in the house and that is all we have')).toBe('en');
  });

  it('detects German', () => {
    expect(top('das ist ein test und die katze ist auf dem tisch')).toBe('de');
  });

  it('detects French', () => {
    expect(top('le chat est dans la maison et je ne sais pas pourquoi')).toBe('fr');
  });

  it('detects Spanish', () => {
    expect(top('el gato está en la casa y no sé por qué pero es así')).toBe('es');
  });

  it('detects Portuguese', () => {
    expect(top('o gato está na casa e não sei por que mas é assim mais uma vez')).toBe('pt');
  });

  it('detects Swedish', () => {
    expect(top('det är en katt som är på bordet och jag vet inte varför')).toBe('sv');
  });
});

describe('detectLanguage — diacritic hints', () => {
  it('German ß biases toward German', () => {
    expect(top('Straße')).toBe('de');
  });

  it('Spanish ñ biases toward Spanish', () => {
    expect(top('mañana')).toBe('es');
  });

  it('Polish letters bias toward Polish', () => {
    expect(top('źdźbło łąka')).toBe('pl');
  });
});

describe('detectLanguage — metadata prior', () => {
  it('uses the hint when text is too short to signal', () => {
    expect(top('ok', 'fr')).toBe('fr');
  });

  it('normalizes a regioned code', () => {
    expect(top('ok', 'pt-BR')).toBe('pt');
  });

  it('does not let the hint override an obvious script', () => {
    // Declared English, but visibly all Cyrillic.
    expect(top('это текст на русском языке полностью', 'en')).toBe('ru');
  });

  it('ignores an unknown hint code', () => {
    expect(detectLanguage('', 'xx')).toEqual([{ lang: 'und', share: 1 }]);
  });
});

describe('detectLanguage — degenerate input', () => {
  it('returns und for empty text', () => {
    expect(detectLanguage('')).toEqual([{ lang: 'und', share: 1 }]);
  });

  it('returns und-heavy for pure numbers/punctuation', () => {
    expect(top('123 !!! @#$ ...')).toBe('und');
  });

  it('always returns shares that sum to ~1', () => {
    const dist = detectLanguage('the cat und die katze mit ß');
    const sum = dist.reduce((s, d) => s + d.share, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe('detectLanguageMix', () => {
  it('produces a mostly-English, some-German mix', () => {
    const items = [
      { text: 'the quick brown fox is in the house and that is all we have here' },
      { text: 'we are having a great time and this is the best day of the year' },
      { text: 'you can see that the weather is nice and we are all very happy' },
      { text: 'das ist ein test und die katze ist auf dem tisch mit dem hund' },
    ];
    const mix = detectLanguageMix(items);
    expect(mix[0].lang).toBe('en');
    expect(mix.some((m) => m.lang === 'de')).toBe(true);
    expect(mix.find((m) => m.lang === 'en')!.share).toBeGreaterThan(
      mix.find((m) => m.lang === 'de')!.share,
    );
  });

  it('folds slivers below minShare into und', () => {
    const items = Array.from({ length: 100 }, () => ({
      text: 'the quick brown fox is in the house and that is all we have here',
    }));
    items.push({ text: 'mañana' }); // ~1% Spanish sliver
    const mix = detectLanguageMix(items, 0.05);
    expect(mix.some((m) => m.lang === 'es')).toBe(false);
    expect(mix.find((m) => m.lang === 'und')).toBeTruthy();
  });

  it('shares sum to ~1', () => {
    const mix = detectLanguageMix([
      { text: 'the cat is here' },
      { text: 'これはテスト' },
      { text: 'le chat est ici' },
    ]);
    expect(mix.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1, 5);
  });

  it('returns und for an all-empty sample', () => {
    expect(detectLanguageMix([{ text: '   ' }, { text: '' }])).toEqual([{ lang: 'und', share: 1 }]);
  });

  it('honors per-item metadata hints', () => {
    const mix = detectLanguageMix([
      { text: 'ok', meta: 'ja' },
      { text: 'sure', meta: 'ja' },
    ]);
    expect(mix[0].lang).toBe('ja');
  });
});

describe('detectScriptLanguage (short strings / hashtags)', () => {
  it('commits on unambiguous non-Latin scripts', () => {
    expect(detectScriptLanguage('안녕')).toBe('ko');
    // A place name can appear in several Cyrillic languages; require prose clues.
    expect(detectScriptLanguage('Москва')).toBeNull();
    expect(detectScriptLanguage('это русский текст')).toBe('ru');
    expect(detectScriptLanguage('مصر')).toBeNull(); // shared Arabic/Persian place name
    expect(detectScriptLanguage('هذا عربي')).toBe('ar');
    expect(detectScriptLanguage('Αθήνα')).toBe('el');
    expect(detectScriptLanguage('กรุงเทพ')).toBe('th');
  });

  it('treats bare Han as undetermined (東京 could be ja or zh)', () => {
    // No kana to disambiguate: don't commit, so nothing is wrongly hidden.
    expect(detectScriptLanguage('東京')).toBeNull();
    expect(detectScriptLanguage('中')).toBeNull();
    expect(detectScriptLanguage('中文')).toBe('zh');
  });

  it('refines Cyrillic to Ukrainian on its unique letters', () => {
    expect(detectScriptLanguage('Київ')).toBe('uk');
  });

  it('returns null for plain Latin input with no exclusive letter (undetermined)', () => {
    expect(detectScriptLanguage('Eurovision')).toBeNull();
    expect(detectScriptLanguage('Berlin')).toBeNull();
    expect(detectScriptLanguage('München')).toBeNull(); // ü is shared, not exclusive
    expect(detectScriptLanguage('café')).toBeNull(); // é is shared
    expect(detectScriptLanguage('Malmö')).toBeNull(); // ö shared across sv/de/fi/tr
  });

  it('commits on language-exclusive Latin letters', () => {
    expect(detectScriptLanguage('Straße')).toBe('de'); // ß
    expect(detectScriptLanguage('mañana')).toBe('es'); // ñ
    expect(detectScriptLanguage('¿Qué?')).toBe('es'); // inverted question mark
    expect(detectScriptLanguage('São')).toBeNull(); // ã also occurs in Vietnamese
    expect(detectScriptLanguage('promoção')).toBe('pt'); // ã
    expect(detectScriptLanguage('Łódź')).toBe('pl'); // ł, ż/ź
    expect(detectScriptLanguage('Wrocław')).toBe('pl'); // ł
    expect(detectScriptLanguage('Diyarbakır')).toBe('tr'); // dotless ı
    expect(detectScriptLanguage('Doğa')).toBe('tr'); // ğ
  });

  it('does not commit on shared Scandinavian/French letters', () => {
    // å/ä/ø/æ are shared across sv/da/no/fi — no single-language proof.
    expect(detectScriptLanguage('Göteborg')).toBeNull();
    expect(detectScriptLanguage('København')).toBeNull();
    expect(detectScriptLanguage('smörgåsbord')).toBeNull();
    expect(detectScriptLanguage('français')).toBeNull(); // ç shared with pt/tr
  });

  it('returns null for punctuation/digits only', () => {
    expect(detectScriptLanguage('2024')).toBeNull();
    expect(detectScriptLanguage('#!!!')).toBeNull();
  });

  it('treats kana-with-kanji as Japanese', () => {
    expect(detectScriptLanguage('東京です')).toBe('ja');
  });
});

describe('detectScriptCandidates (exposes zh/ja ambiguity)', () => {
  it('returns both zh and ja for bare Han', () => {
    expect(detectScriptCandidates('東京')).toEqual(['zh', 'ja']);
    expect(detectScriptCandidates('速報')).toEqual(['zh', 'ja']);
    expect(detectScriptCandidates('NHK紅白')).toEqual(['zh', 'ja']); // Latin + kanji
  });

  it('commits to ja when kana is present', () => {
    expect(detectScriptCandidates('ドラマ')).toEqual(['ja']);
    expect(detectScriptCandidates('東京です')).toEqual(['ja']);
  });

  it('returns a single language for unambiguous scripts', () => {
    expect(detectScriptCandidates('안녕')).toEqual(['ko']);
    expect(detectScriptCandidates('Київ')).toEqual(['uk']);
    expect(detectScriptCandidates('هذا عربي')).toEqual(['ar']);
  });

  it('returns [] for plain Latin and non-scriptable input', () => {
    expect(detectScriptCandidates('Eurovision')).toEqual([]);
    expect(detectScriptCandidates('2024')).toEqual([]);
  });

  it('uses exclusive letters when present', () => {
    expect(detectScriptCandidates('Straße')).toEqual(['de']);
  });
});

describe('detectLanguage — Esperanto', () => {
  it('detects accented Esperanto rather than French', () => {
    // The bug this covers: eo had no letters, no stop-words, and its diacritics
    // were missing from the tokenizer's word alphabet, so "ĝi"/"ŝatas" were
    // split into fragments and the shared function words (la, de, en) handed
    // the vote to French.
    expect(top('Mi ŝatas la libron kaj ĝi estas tre bona por ĉiuj')).toBe('eo');
    expect(top('Ĉu vi parolas Esperanton kun ni hodiaŭ')).toBe('eo');
  });

  it('detects x-system Esperanto typed on an ASCII keyboard', () => {
    expect(top('Mi sxatas la libron kaj gxi estas tre bona')).toBe('eo');
    expect(top('Saluton kiel vi fartas hodiaux amiko')).toBe('eo');
  });

  it('detects diacritic-free Esperanto from its grammar alone', () => {
    expect(top('Mi legas bonajn librojn kaj skribas leterojn')).toBe('eo');
    expect(top('Ni havas multajn bonajn amikojn en la mondo')).toBe('eo');
  });

  it('does not mistake Romance languages for Esperanto', () => {
    // -o and -a endings are Spanish/Italian/Portuguese too; matching those was
    // what made "Mucho trabajo bueno" read as 82% Esperanto. Only -oj/-ajn and
    // the verb tenses count now.
    expect(top('Mucho trabajo bueno pero poco dinero para todo esto')).toBe('es');
    expect(top('Molto lavoro buono ma poco denaro amico mio caro')).toBe('it');
    expect(top('Muito trabalho bom mas pouco dinheiro para tudo isso')).toBe('pt');
    expect(top('Le chat est sur la table et il mange du pain avec nous')).toBe('fr');
  });

  it('reports Esperanto confidently enough for the compose language warning', () => {
    // The composer only acts on a detection above 0.6. Esperanto shares its
    // commonest function words (la, de, en, mi, por) with the Romance
    // languages, so without discounting their spurious votes a correct eo
    // verdict still landed in the 40s and the banner stayed silent.
    for (const text of [
      'Saluton al ĉiuj! Hodiaŭ mi legis tre bonan libron pri la historio de Esperanto.',
      'Mi sxatas la libron kaj gxi estas tre bona por cxiuj homoj en la mondo',
    ]) {
      const [best] = detectLanguage(text);
      expect(best.lang).toBe('eo');
      expect(best.share).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('pins a lone Esperanto hashtag from its supersigned letters', () => {
    expect(detectScriptLanguage('#ĉevalo')).toBe('eo');
    expect(detectScriptLanguage('#ĝardeno')).toBe('eo');
    // Turkish ğ is a breve, Esperanto ĝ a circumflex — distinct code points, so
    // the two exclusive-letter rules do not poach each other's tags.
    expect(detectScriptLanguage('#Diyarbakır')).toBe('tr');
  });
});

describe('helpers', () => {
  it('every LangCode has a display name', () => {
    for (const code of Object.keys(LANG_NAMES) as LangCode[]) {
      expect(LANG_NAMES[code]).toBeTruthy();
    }
  });

  it('sharePct never rounds a present language to 0', () => {
    expect(sharePct(0.001)).toBe(1);
    expect(sharePct(0.5)).toBe(50);
    expect(sharePct(1)).toBe(100);
  });
});
