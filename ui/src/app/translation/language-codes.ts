import { LANG_NAMES } from '../language/language-detect';

/** Normalize a tag ("en-US", "pt_BR", "EN") to its bare ISO 639-1 code ("en"). */
export function bareLanguage(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase().split(/[-_]/)[0];
}

/**
 * ISO 639-1 → ISO 639-3, for Apertium, which names languages with three letters
 * (`spa|eng`). Covers every language the detector and the posting picker know,
 * plus the minority languages Apertium is best at.
 */
const ISO_639_3: Record<string, string> = {
  af: 'afr',
  an: 'arg',
  ar: 'ara',
  ast: 'ast',
  be: 'bel',
  bg: 'bul',
  bn: 'ben',
  br: 'bre',
  ca: 'cat',
  cs: 'ces',
  cy: 'cym',
  da: 'dan',
  de: 'deu',
  el: 'ell',
  en: 'eng',
  eo: 'epo',
  es: 'spa',
  et: 'est',
  eu: 'eus',
  fa: 'fas',
  fi: 'fin',
  fr: 'fra',
  ga: 'gle',
  gl: 'glg',
  he: 'heb',
  hi: 'hin',
  hr: 'hrv',
  hu: 'hun',
  id: 'ind',
  is: 'isl',
  it: 'ita',
  ja: 'jpn',
  kk: 'kaz',
  ko: 'kor',
  lt: 'lit',
  lv: 'lav',
  mk: 'mkd',
  ms: 'msa',
  mt: 'mlt',
  nb: 'nob',
  nl: 'nld',
  nn: 'nno',
  no: 'nob',
  oc: 'oci',
  pl: 'pol',
  pt: 'por',
  ro: 'ron',
  ru: 'rus',
  sc: 'srd',
  sk: 'slk',
  sl: 'slv',
  sq: 'sqi',
  sr: 'srp',
  sv: 'swe',
  ta: 'tam',
  te: 'tel',
  th: 'tha',
  tr: 'tur',
  tt: 'tat',
  uk: 'ukr',
  ur: 'urd',
  uz: 'uzb',
  vi: 'vie',
  zh: 'zho',
};

/** The Apertium (ISO 639-3) code for a tag, or null when we have no mapping. */
export function toIso6393(code: string): string | null {
  return ISO_639_3[bareLanguage(code)] ?? null;
}

/** A language's English name: the detector's list, then the browser's, then the code. */
export function languageDisplayName(code: string): string {
  const bare = bareLanguage(code);
  if (!bare) return '';
  const known = (LANG_NAMES as Record<string, string>)[bare];
  if (known && bare !== 'und') return known;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(bare);
    if (name && name.toLowerCase() !== bare) return name;
  } catch {
    /* Unknown code, or no Intl.DisplayNames: fall through. */
  }
  return bare.toUpperCase();
}
