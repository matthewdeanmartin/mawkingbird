/**
 * Per-language rules the merge gate enforces, and the trap words it sweeps for.
 *
 * ## Why this file exists
 *
 * German was translated first, and its defects were found by *reading it
 * afterwards*: `Blockieren Sie die Amnestie` for the unblock-everyone button,
 * `Anrufe` (telephone calls) for API calls, `Zeitleiste` (a chronology widget)
 * for the timeline. Every one of those passed `make i18n` — placeholder parity
 * and coverage are necessary and nowhere near sufficient, because coverage
 * counts keys and cannot read.
 *
 * French was translated second, with a validating merge tool written *before*
 * any translating started. Nothing reached `fr.json` except through it. Same
 * total effort, far better result, because a defect rejected at the door costs
 * one retry and a defect found three days later costs a re-read of 5,700 keys.
 *
 * That tool lived in a scratch directory and was French-only. This file is the
 * same idea made per-locale and committed, so language #4 through #60 inherit
 * it instead of re-deriving it.
 *
 * ## What belongs here
 *
 * Two kinds of rule, and the difference matters:
 *
 * - `rules` are **hard gates**. A batch that violates one is rejected whole.
 *   Put a rule here only when a violation is unambiguously wrong and mechanical
 *   to detect — French's narrow no-break space, a register that must not appear
 *   at all. A rule with false positives teaches translators to work around the
 *   checker, which is how the French `<code>` exemption bug got 5 real prose
 *   keys skipped.
 *
 * - `traps` are **advisory greps**. They encode the *wrong sense* of a glossary
 *   term — the meaning a translator reaches for when the word arrives without
 *   context. A hit is not proof of a bug (`Analyseskript` is a legitimate
 *   "script"), so these never fail a build; `make i18n-traps L=xx` prints them
 *   for a human or agent to judge. This sweep found real bugs on both German
 *   passes and is worth minutes.
 *
 * A locale with no entry here still merges — it just gets placeholder, markup
 * and `max` checking, which every locale gets. Adding an entry is optional and
 * incremental: write the traps you know on day one, add more as you find them.
 */

/**
 * Exempt literal syntax before applying a typography rule.
 *
 * Code samples, URLs and HTML entities carry punctuation a reader copies
 * verbatim; French spacing does not apply inside `<code>from:handle</code>`.
 * Blanking them (rather than skipping the whole string) is what lets a prose
 * sentence containing a code sample still be checked — the French tool
 * originally failed here and agents worked around it by leaving real keys
 * untranslated.
 */
function proseOnly(value) {
  return value
    .replace(/<code>[\s\S]*?<\/code>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/&(?:[a-zA-Z]+|#[0-9]+);/g, ' ')
    .replace(/\{\{\s*[\w.]+\s*\}\}/g, ' ');
}

export const LOCALE_RULES = {
  hi: {
    name: 'Hindi',
    register: 'neutral concise modern Hindi UI prose; use natural `आप` address consistently',
    rules: [],
    traps: {
      'सिग्नल बढ़ाना': 'Boost is a social-media re-share, not signal amplification',
      'पीछा करना': 'Follow means follow an account, not chase or stalk',
      'दरवाज़े का हैंडल': 'Handle is an account identifier, not a physical handle',
      'सिलाई का धागा': 'Thread is a conversation, not sewing thread',
      'चालू खाता': 'Current account is the active account, not a bank account',
      'फ़ोन कॉल': 'API call is not a telephone call',
      'भोजन': 'Feed is a stream of posts, not food',
    },
  },
  vi: {
    name: 'Vietnamese',
    register: 'neutral concise Vietnamese UI prose; natural second-person wording without unnecessary honorifics',
    rules: [],
    traps: {
      'tăng cường tín hiệu': 'Boost is a social-media re-share, not signal amplification',
      'theo đuổi': 'Follow means follow an account, not pursue or chase',
      'tay cầm': 'Handle is an account identifier, not a physical handle',
      'chỉ may': 'Thread is a conversation, not sewing thread',
      'tài khoản vãng lai': 'Current account is the active account, not a bank account',
      'cuộc gọi điện thoại': 'API call is not a telephone call',
      'thức ăn': 'Feed is a stream of posts, not food',
    },
  },
  ru: {
    name: 'Russian',
    register: 'neutral concise Russian UI prose; informal singular `ты` and plural `вы`',
    rules: [],
    traps: {
      'усилить сигнал': 'Boost is a social-media re-share, not signal amplification',
      'преследовать': 'Follow means follow an account, not pursue or stalk',
      'ручка': 'Handle is an account identifier, not a physical handle',
      'швейная нить': 'Thread is a conversation, not sewing thread',
      'текущий счёт': 'Current account is the active account, not a bank account',
      'телефонный звонок': 'API call is not a telephone call',
      '(?:^|[^А-Яа-яЁё])еда(?:$|[^А-Яа-яЁё])': 'Feed is a stream of posts, not food',
    },
  },
  tr: {
    name: 'Turkish',
    register: 'neutral concise Turkish UI prose; informal singular `sen` and plural `siz`',
    rules: [],
    traps: {
      'sinyali güçlendirmek': 'Boost is a social-media re-share, not signal amplification',
      'takip etmek peşinde': 'Follow means follow an account, not pursue',
      'kapı kolu': 'Handle is an account identifier, not a physical handle',
      'dikiş ipliği': 'Thread is a conversation, not sewing thread',
      'cari hesap': 'Current account is the active account, not a bank account',
      'telefon görüşmesi': 'API call is not a telephone call',
      yiyecek: 'Feed is a stream of posts, not food',
    },
  },
  pt: {
    name: 'Portuguese',
    register: 'neutral international Portuguese; `você` singular and `vocês` plural',
    rules: [],
    traps: {
      impulsionar: 'Boost is a social-media re-share, not promotion',
      alimento: 'Feed is a stream of posts, not food',
      perseguir: 'Follow means seguir, not pursue',
      'conta corrente': 'Current account is the active account, not a bank account',
      'chamada telefônica': 'API call is not a telephone call',
      'fio de costura': 'Thread is a conversation, not sewing thread',
      alça: 'Handle is an account identifier, not a physical handle',
    },
  },
  sv: {
    name: 'Swedish',
    register: 'neutral concise standard Swedish; informal `du` singular and `ni` plural',
    rules: [],
    traps: {
      förstärka: 'Boost is a social-media re-share, not signal amplification',
      förfölja: 'Follow means följa an account, not pursue',
      handtag: 'Handle is an account identifier, not a physical handle',
      sytråd: 'Thread is a conversation, not sewing thread',
      'löpande konto': 'Current account is the active account, not a bank account',
      telefonsamtal: 'API call is not a telephone call',
      '\\bmat\\b': 'Feed is a stream of posts, not food',
    },
  },
  it: {
    name: 'Italian',
    register: 'neutral Italian; informal `tu` singular and `voi` plural',
    rules: [],
    traps: {
      potenziare: 'Boost is a social-media re-share, not amplification',
      inseguire: 'Follow means seguire, not pursue',
      maniglia: 'Handle is an account identifier, not a physical handle',
      'filo da cucito': 'Thread is a conversation, not sewing thread',
      'conto corrente': 'Current account is the active account, not a bank account',
      telefonata: 'API call is not a telephone call',
    },
  },
  nl: {
    name: 'Dutch',
    register: 'Standard Dutch; informal `je` singular and `jullie` plural',
    rules: [],
    traps: {
      versterken: 'Boost is a social-media re-share, not amplification',
      achtervolgen: 'Follow means volgen, not pursue',
      handvat: 'Handle is an account identifier, not a physical handle',
      naaigaren: 'Thread is a conversation, not sewing thread',
      betaalrekening: 'Current account is the active account, not a bank account',
      telefoongesprek: 'API call is not a telephone call',
      voedsel: 'Feed is a stream of posts, not food',
    },
  },
  pl: {
    name: 'Polish',
    register: 'neutral concise Polish UI prose; avoid formal `Państwo` address',
    rules: [],
    traps: {
      'wzmacniać sygnał': 'Boost is a social-media re-share, not signal amplification',
      prześladować: 'Follow means obserwować, not stalk',
      uchwyt: 'Handle is an account identifier, not a physical handle',
      'nić do szycia': 'Thread is a conversation, not sewing thread',
      'rachunek bieżący': 'Current account is the active account, not a bank account',
      'rozmowa telefoniczna': 'API call is not a telephone call',
      żywność: 'Feed is a stream of posts, not food',
    },
  },
  es: {
    name: 'Spanish',
    register: 'neutral international Spanish; informal singular `tú`, plural `ustedes`',
    rules: [],
    traps: {
      impulsar: 'Boost is a social-media re-share: use republicar, not promote/propel',
      alimento: 'Feed is a stream of posts: use cronología/feed, not food',
      mango: 'Handle is an account identifier: use usuario/identificador, not a physical handle',
      perseguir: 'Follow an account means seguir, not pursue or stalk',
      silenciar: 'Mute is silenciar; inspect hits only to keep it distinct from bloquear',
      'hilo de coser': 'Thread is a conversation thread: use hilo, not sewing thread',
      'cuenta corriente': 'Current account is the active account, not a bank account',
      'llamada telefónica': 'API call is llamada/solicitud de API, not a telephone call',
      ballena: 'Fail whale is an error-page joke; inspect literal translations in context',
    },
  },
  'zh-Hant': {
    name: 'Traditional Chinese (Taiwan)',
    register: 'neutral, concise Taiwan UI prose; omit pronouns or consistently use 您',
    rules: [],
    traps: {
      '服务器|软件|设置|账号|关注|转发|静音|屏蔽':
        'Simplified script or mainland terminology: consult glossary-zh-Hant.md',
      '服務器|軟件|設置|賬號|關注|轉發': 'Taiwan terminology: 伺服器、軟體、設定、帳號、跟隨、轉嘟',
      '助推|增幅|提升訊號': 'Boost means 轉嘟, not amplification or promotion',
      '把手|手柄': 'Account handle means 帳號代稱, not a physical handle',
      '飼料|餵食': 'Feed is a stream of posts, not food',
      '螺紋|縫紉': 'Thread means 討論串',
      活期帳戶: 'Current account means 目前使用的帳號',
      失敗的鯨魚: 'Fail whale is an error-page joke; do not translate literally',
      你: 'Address form review: 您 or omitted pronoun; inspect quotes before changing a hit',
    },
  },
  fr: {
    name: 'French',
    register: 'informal `tu` throughout — never `vous`',
    rules: [
      {
        id: 'narrow-space',
        why: 'French typography puts a narrow no-break space (U+202F) before : ; ? !',
        check(value) {
          const hits = proseOnly(value).match(/[^\s\u202f\u00a0][;?!:]/g) || [];
          // 14:30 is a clock, not a colon needing a space.
          const real = hits.filter((h) => !/\d:\d/.test(h));
          return real.length ? `missing narrow space before ${real.join(' ')}` : null;
        },
      },
      {
        id: 'ascii-apostrophe',
        why: "French elision uses U+2019 (l’, d’, qu’), never ASCII '",
        check: (value) => (/'/.test(proseOnly(value)) ? 'ASCII apostrophe' : null),
      },
      {
        id: 'formal-register',
        why: 'rule 6: informal `tu`, held across the whole file',
        check: (value) => (/\bvous\b/i.test(value) ? 'formal `vous`' : null),
      },
      {
        id: 'inclusive-endings',
        why: '`·e` endings dodge agreement instead of restructuring — see rule 7',
        check: (value) => (/·e\b/.test(value) ? 'inclusive `·e` ending' : null),
      },
    ],
    traps: {
      booster: 'Boost → partager, not booster/amplifier',
      amplifi: 'Boost → partager, not amplifier',
      poursuiv: 'Follow → suivre; poursuivre reads as pursue',
      traqu: 'Follow → suivre; traquer reads as stalk',
      nourriture: 'Feed → flux, not the food sense',
      alimentation: 'Feed → flux, not the food sense',
      poignée: 'Handle → identifiant, not a door handle',
      filetage: 'Thread → fil, not a screw thread',
      'ligne du temps': 'Timeline → fil / timeline',
      préféré: 'Favourite → favori',
      lumière: 'Light theme → Clair',
      'coup de téléphone': 'API call → requête / appel d’API',
      muet: 'Mute → masquer, not silent',
    },
  },

  de: {
    name: 'German',
    register: 'informal `du` throughout — never `Sie` as a form of address',
    rules: [
      {
        id: 'formal-register',
        why: 'rule 6: informal `du`. Note third-person sie/ihre is legitimate, so this only flags capitalised `Sie` mid-sentence',
        check(value) {
          const hit = /(?<=[a-zäöüß,] )Sie\b/.test(value);
          return hit ? 'formal `Sie`' : null;
        },
      },
    ],
    traps: {
      Anruf: 'API call → Aufruf / Anfrage; Anruf is a telephone call',
      verfolg: 'Follow → folgen; verfolgen reads as stalk/pursue',
      Zeitleiste: 'Timeline → Timeline; a Zeitleiste is a chronology widget',
      '\bLicht': 'Light theme → Hell; Licht is illumination',
      Pasten: 'Paste → Paste; Pasten is pasta',
      Girokonto: 'current account → aktuelles Konto, not a bank account',
      'Wal\\b': 'Fail whale is a joke, never a literal whale',
      Faden: 'Thread → Thread; Faden is sewing thread',
      Futter: 'Feed → Feed; Futter is animal fodder',
      '\bGriff': 'Handle → Handle; Griff is a grip',
    },
  },

  id: {
    name: 'Indonesian',
    register:
      'neutral-informal — `kamu`/`Anda` are both possible; hold ONE. This file uses `kamu`.',
    rules: [
      {
        id: 'formal-register',
        why: 'rule 6: register held across the file. This locale committed to `kamu`; `Anda` is the mixed-register defect German shipped.',
        check: (value) =>
          /\bAnda\b/.test(value) ? 'formal `Anda` (this locale uses `kamu`)' : null,
      },
    ],
    traps: {
      dorongan: 'Boost → the Mastodon term (see glossary), not dorongan/boost-as-encouragement',
      meningkatkan: 'Boost → re-share, not increase',
      tiang: 'Post → kiriman/postingan, never tiang (a physical pole)',
      'pos\\b': 'Post → kiriman/postingan; `pos` alone reads as mail/post office',
      'panggilan telepon': 'API call → permintaan/panggilan API, not a phone call',
      membuntuti: 'Follow → mengikuti; membuntuti reads as tailing someone',
      menguntit: 'Follow → mengikuti; menguntit is stalking',
      makanan: 'Feed → feed/umpan, never the food sense',
      'memberi makan': 'Feed → feed/umpan, never the verb "to feed"',
      benang: 'Thread → utas, not sewing thread',
      gagang: 'Handle → handle/nama pengguna, not a door handle',
      pegangan: 'Handle → handle/nama pengguna, not a grip',
      cahaya: 'Light theme → Terang, not illumination',
      '\bringan': 'Light theme → Terang; ringan is low-weight',
      '\bbisu\b': 'Mute → bisukan (verb); bare `bisu` is the speech-disability sense',
      'garis waktu': 'Timeline → linimasa (the established Indonesian term)',
      'saring kopi': 'Filter → filter/saringan in the rule sense',
      // `paus` (lowercase) is the correct Indonesian for whale and is expected
      // in the fail-whale joke. Capitalised `Paus` mid-sentence is the Pope.
      '(?<=[a-z,] )Paus\b': 'Capitalised Paus reads as the Pope; the whale is lowercase paus',
      // The *product noun* only. Indonesian's verb "tempel/menempel" (to paste
      // something in) is correct wherever English used the verb, so match the
      // noun shapes: "sebuah tempelan", "Tempelan saya".
      tempelan: 'Paste (the pastebin item) stays "Paste"; tempelan is the pasted thing',
    },
  },

  ja: {
    name: 'Japanese',
    register: 'polite です／ます throughout — not keigo or plain form',
    rules: [],
    traps: {
      増幅: 'Boost → ブースト／再共有, not signal amplification',
      強化: 'Boost → ブースト／再共有, not strengthening',
      食べ物: 'Feed → フィード, not food',
      餌: 'Feed → フィード, not animal feed',
      追跡: 'Follow → フォロー, not pursuit/stalking',
      裁縫: 'Thread → スレッド, not sewing thread',
      ネジ: 'Thread → スレッド, not screw thread',
      電話: 'API call → APIリクエスト, not telephone call',
      光: 'Light theme → ライト, not illumination',
      重量: 'Light theme → ライト, not low weight',
      接着剤: 'Paste → Paste, not glue',
      鯨: 'Fail whale → 失敗クジラ joke, not literal whale',
    },
  },
};

/** Rules for a locale, or an empty set for one that has no entry yet. */
export function rulesFor(lang) {
  return LOCALE_RULES[lang] ?? { name: lang, rules: [], traps: {} };
}
