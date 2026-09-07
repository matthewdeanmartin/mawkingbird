import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientPrefs } from './client-prefs';
import { Status, Tag } from './models';
import {
  AutoTranslateEligibility,
  FeedLanguageFilter,
  KnownLanguages,
  TrendLanguageFilter,
  UI_LANGUAGE,
} from './trend-language-filter';

function tag(name: string): Tag {
  return {
    id: name,
    name,
    url: `https://x/tags/${name}`,
    following: false,
    featuring: false,
    history: [],
  };
}

function post(
  content: string,
  language: string | null = null,
  overrides: Partial<Status> = {},
): Status {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content: `<p>${content}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: 'a', username: 'a', acct: 'a', display_name: 'A' } as never,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    language,
    media_attachments: [],
    ...overrides,
  };
}

describe('TrendLanguageFilter', () => {
  let prefs: ClientPrefs;
  let filter: TrendLanguageFilter;
  let known: KnownLanguages;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    prefs = TestBed.inject(ClientPrefs);
    filter = TestBed.inject(TrendLanguageFilter);
    known = TestBed.inject(KnownLanguages);
  });

  it('passes everything through when the toggle is off', () => {
    prefs.setExcludeUnknownLangTrends(false);
    const tags = [tag('東京'), tag('Eurovision'), tag('مصر')];
    expect(filter.apply(tags)).toEqual(tags);
  });

  it('always knows the UI language', () => {
    expect(known.knows(UI_LANGUAGE)).toBe(true);
  });

  it('hides a confidently-foreign-script tag when the language is unknown', () => {
    prefs.setKnownLanguages(['en']);
    prefs.setExcludeUnknownLangTrends(true);
    // The shared Arabic/Persian place name is ambiguous, so it stays visible.
    const kept = filter.apply([tag('안녕'), tag('Eurovision'), tag('مصر')]);
    expect(kept.map((t) => t.name)).toEqual(['Eurovision', 'مصر']);
    expect(filter.apply([tag('هذا_عربي')])).toEqual([]);
  });

  it('keeps a foreign-script tag when its language IS known', () => {
    prefs.setKnownLanguages(['en', 'ko']);
    prefs.setExcludeUnknownLangTrends(true);
    const kept = filter.apply([tag('안녕'), tag('Berlin')]);
    expect(kept.map((t) => t.name)).toEqual(['안녕', 'Berlin']);
  });

  it('hides bare-Han tags from a reader who knows neither Chinese nor Japanese', () => {
    // Regression: kanji-only Japanese trends (#東京, #速報, #地震) were leaking
    // through to an English-only reader because bare Han was treated as "keep".
    prefs.setKnownLanguages(['en']); // knows neither ja nor zh
    prefs.setExcludeUnknownLangTrends(true);
    const kept = filter.apply([tag('東京'), tag('速報'), tag('地震'), tag('Eurovision')]);
    expect(kept.map((t) => t.name)).toEqual(['Eurovision']);
  });

  it('keeps bare-Han tags when the reader knows Japanese (might be ja)', () => {
    prefs.setKnownLanguages(['en', 'ja']);
    prefs.setExcludeUnknownLangTrends(true);
    expect(filter.shouldShow(tag('東京'))).toBe(true);
  });

  it('keeps bare-Han tags when the reader knows Chinese (might be zh)', () => {
    prefs.setKnownLanguages(['en', 'zh']);
    prefs.setExcludeUnknownLangTrends(true);
    expect(filter.shouldShow(tag('東京'))).toBe(true);
  });

  it('hides a long kana-bearing meme tag from a non-Japanese reader', () => {
    // Regression: a sentence-length hashtag mixing kanji, kana and digits
    // (#7月以内にこの投稿が50リア行かなかったらさようなら) leaked to an
    // English-only reader. Kana anywhere pins it to Japanese, so it must hide.
    prefs.setKnownLanguages(['en']);
    prefs.setExcludeUnknownLangTrends(true);
    const meme = tag('7月以内にこの投稿が50リア行かなかったらさようなら');
    expect(filter.shouldShow(meme)).toBe(false);
  });

  it('hides a Latin tag with an exclusive letter in an unknown language', () => {
    prefs.setKnownLanguages(['en']); // no German
    prefs.setExcludeUnknownLangTrends(true);
    // #Straße carries ß, which is German-exclusive.
    const kept = filter.apply([tag('Straße'), tag('Eurovision'), tag('Wrocław')]);
    // Straße → de (hidden), Wrocław → pl (hidden), Eurovision → undetermined (kept).
    expect(kept.map((t) => t.name)).toEqual(['Eurovision']);
  });

  it('keeps an exclusive-letter tag when that language is known', () => {
    prefs.setKnownLanguages(['en', 'de']);
    prefs.setExcludeUnknownLangTrends(true);
    expect(filter.shouldShow(tag('Straße'))).toBe(true);
  });

  it('still keeps shared-diacritic Latin tags (München, café)', () => {
    prefs.setKnownLanguages(['en']);
    prefs.setExcludeUnknownLangTrends(true);
    // ü and é are shared across many languages — not proof — so these are kept.
    const kept = filter.apply([tag('München'), tag('café')]);
    expect(kept.map((t) => t.name)).toEqual(['München', 'café']);
  });

  it('always keeps Latin-alphabet tags (undetermined script)', () => {
    prefs.setKnownLanguages(['ja']); // user does NOT list English
    prefs.setExcludeUnknownLangTrends(true);
    // Even though 'en' isn't explicitly listed, Latin script is undetermined → kept.
    const kept = filter.apply([tag('München'), tag('Eurovision')]);
    expect(kept.map((t) => t.name)).toEqual(['München', 'Eurovision']);
  });

  it('strips a leading # before detecting', () => {
    prefs.setKnownLanguages(['en']);
    prefs.setExcludeUnknownLangTrends(true);
    expect(filter.shouldShow(tag('#안녕'))).toBe(false);
    expect(filter.shouldShow(tag('#Eurovision'))).toBe(true);
  });

  it('reacts to explicitly added/removed known languages', () => {
    prefs.setKnownLanguages([]);
    prefs.setExcludeUnknownLangTrends(true);
    expect(filter.shouldShow(tag('안녕'))).toBe(false); // Korean, unknown
    prefs.addKnownLanguage('ko');
    expect(filter.shouldShow(tag('안녕'))).toBe(true);
    prefs.removeKnownLanguage('ko');
    expect(filter.shouldShow(tag('안녕'))).toBe(false);
  });
});

describe('KnownLanguages', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('includes the UI language as a floor even with no prefs', () => {
    const known = TestBed.inject(KnownLanguages);
    expect(known.codes().has(UI_LANGUAGE)).toBe(true);
  });

  it('normalizes regioned codes from the explicit list', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const known = TestBed.inject(KnownLanguages);
    prefs.setKnownLanguages(['pt-BR', 'DE']);
    expect(known.knows('pt')).toBe(true);
    expect(known.knows('de')).toBe(true);
  });
});

describe('FeedLanguageFilter', () => {
  let prefs: ClientPrefs;
  let filter: FeedLanguageFilter;

  const FRENCH = 'le chat est dans la maison et je ne sais pas pourquoi mais il est là';
  const ENGLISH = 'the quick brown fox is in the house and that is all we have here today';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    prefs = TestBed.inject(ClientPrefs);
    filter = TestBed.inject(FeedLanguageFilter);
    prefs.setKnownLanguages(['en']); // user knows English only
  });

  it('passes everything through when the toggle is off', () => {
    prefs.setHideForeignLangPosts(false);
    expect(filter.shouldShow(post(FRENCH, 'fr'))).toBe(true);
  });

  it('hides a post that declares a language the user does not know', () => {
    prefs.setHideForeignLangPosts(true);
    expect(filter.hideReason(post('court texte', 'fr'))).toBe('foreign');
  });

  it('keeps a post declared in a known language', () => {
    prefs.setHideForeignLangPosts(true);
    expect(filter.shouldShow(post(ENGLISH, 'en'))).toBe(true);
  });

  it('hides a foreign post with no declared language but confident detection', () => {
    prefs.setHideForeignLangPosts(true);
    expect(filter.hideReason(post(FRENCH, null))).toBe('foreign');
  });

  it('narrows to the chosen languages, hiding known ones left out', () => {
    // The point of narrowing: someone who reads English and Esperanto asks for
    // only Esperanto today. English is still a language they know — it just
    // isn't what they want in the feed right now.
    prefs.setKnownLanguages(['en', 'eo']);
    prefs.setFeedLanguages(['eo']);
    expect(filter.hideReason(post(ENGLISH, 'en'))).toBe('foreign');
    expect(filter.shouldShow(post('Mi ŝatas la libron kaj ĝi estas bona', 'eo'))).toBe(true);
  });

  it('choosing languages turns the filter on by itself', () => {
    prefs.setHideForeignLangPosts(false);
    prefs.setFeedLanguages(['eo']);
    expect(prefs.hideForeignLangPosts()).toBe(true);
  });

  it('an empty selection means every known language, not nothing', () => {
    prefs.setFeedLanguages([]);
    prefs.setHideForeignLangPosts(true);
    expect(filter.shouldShow(post(ENGLISH, 'en'))).toBe(true);
  });

  it('never keeps more than three languages', () => {
    prefs.setFeedLanguages(['en', 'eo', 'fr', 'de']);
    expect(prefs.feedLanguages()).toEqual(['en', 'eo', 'fr']);
  });

  it('flags misrepresentation: declared en, text confidently French', () => {
    prefs.setKnownLanguages(['en', 'fr']); // knows both, so not "foreign"
    prefs.setHideForeignLangPosts(true);
    expect(filter.hideReason(post(FRENCH, 'en'))).toBe('misrepresented');
  });

  it('never hides a post too short to detect and with no declared language', () => {
    prefs.setHideForeignLangPosts(true);
    expect(filter.shouldShow(post('hi', null))).toBe(true);
    expect(filter.shouldShow(post('ok merci', null))).toBe(true); // short → unsure
  });

  it('never hides on ambiguous detection (no confident winner)', () => {
    prefs.setHideForeignLangPosts(true);
    // Numbers/punctuation only — detection returns und → keep.
    expect(filter.shouldShow(post('12345 67890 !!! ??? ...', null))).toBe(true);
  });

  it('uses the boost target language for a reblog', () => {
    prefs.setHideForeignLangPosts(true);
    const inner = post(FRENCH, 'fr');
    const boost = post('', null, { reblog: inner });
    expect(filter.hideReason(boost)).toBe('foreign');
  });

  it('apply() preserves order and drops only sure-foreign posts', () => {
    prefs.setHideForeignLangPosts(true);
    const list = [post(ENGLISH, 'en'), post(FRENCH, 'fr'), post('hi', null)];
    const kept = filter.apply(list);
    expect(kept).toHaveLength(2); // English kept, French dropped, short kept
    expect(kept[0]).toBe(list[0]);
    expect(kept[1]).toBe(list[2]);
  });

  describe('languages you are learning are never hidden', () => {
    // The learner rule: hiding the French posts from someone learning French removes
    // exactly the material they followed those accounts for.

    beforeEach(() => {
      prefs.setHideForeignLangPosts(true);
      prefs.setLearningLanguages(['fr']);
    });

    it('keeps a declared post in a language being learned', () => {
      expect(filter.shouldShow(post('court texte', 'fr'))).toBe(true);
    });

    it('keeps an undeclared post detected as a language being learned', () => {
      expect(filter.shouldShow(post(FRENCH, null))).toBe(true);
    });

    it('keeps it even when the feed is narrowed to other languages', () => {
      // Narrowing is "just Esperanto today"; it must not silently cancel the
      // learner exemption, or the filter would hide what you are studying.
      prefs.setKnownLanguages(['en', 'eo']);
      prefs.setFeedLanguages(['eo']);
      expect(filter.shouldShow(post(FRENCH, 'fr'))).toBe(true);
    });

    it('keeps a mislabelled post whose text is confidently the learned language', () => {
      // Declared `en`, text confidently French: that is still French practice, and
      // the mislabelling is the poster's mistake, not a reason to withhold it.
      expect(filter.hideReason(post(FRENCH, 'en'))).toBeNull();
    });

    it('keeps a boost of a post in a language being learned', () => {
      const boost = post('', null, { reblog: post(FRENCH, 'fr') });
      expect(filter.shouldShow(boost)).toBe(true);
    });

    it('still hides languages that are neither known nor being learned', () => {
      // The exemption is narrow: it must not become "stop filtering entirely".
      expect(filter.hideReason(post('東京は今日はとても暑いですね', 'ja'))).toBe('foreign');
    });
  });
});

describe('AutoTranslateEligibility', () => {
  let prefs: ClientPrefs;
  let eligibility: AutoTranslateEligibility;

  const FRENCH = 'le chat est dans la maison et je ne sais pas pourquoi mais il est là';
  const ENGLISH = 'the quick brown fox is in the house and that is all we have here today';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    prefs = TestBed.inject(ClientPrefs);
    eligibility = TestBed.inject(AutoTranslateEligibility);
    prefs.setKnownLanguages(['en']);
    prefs.setLearningLanguages(['fr']);
    prefs.setAutoTranslateMode('view');
  });

  it('translates nothing at all while the mode is off', () => {
    // The default, and the only state that costs nothing.
    prefs.setAutoTranslateMode('off');
    expect(eligibility.skipReason(post(FRENCH, 'fr'))).toBe('mode-off');
  });

  it('translates a post in a language being learned', () => {
    expect(eligibility.shouldTranslate(post(FRENCH, 'fr'))).toBe(true);
  });

  it('never translates a language the reader already knows', () => {
    expect(eligibility.skipReason(post(ENGLISH, 'en'))).toBe('known');
  });

  it('never translates an undetermined post, because it is probably English', () => {
    // Translating English into English is a call spent to change nothing.
    expect(eligibility.skipReason(post('hi', null))).toBe('undetermined');
    expect(eligibility.skipReason(post('12345 !!! ???', null))).toBe('undetermined');
  });

  it('leaves other foreign languages alone until translate-all is on', () => {
    const japanese = post('東京は今日はとても暑いですね', 'ja');
    expect(eligibility.skipReason(japanese)).toBe('not-learning');
    prefs.setTranslateAllForeign(true);
    expect(eligibility.shouldTranslate(japanese)).toBe(true);
  });

  it('still refuses known and undetermined posts under translate-all', () => {
    // The $$$ switch widens which *foreign* posts qualify. It must not start paying
    // to translate English into English.
    prefs.setTranslateAllForeign(true);
    expect(eligibility.skipReason(post(ENGLISH, 'en'))).toBe('known');
    expect(eligibility.skipReason(post('hi', null))).toBe('undetermined');
  });

  it('uses the boost target language for a reblog', () => {
    const boost = post('', null, { reblog: post(FRENCH, 'fr') });
    expect(eligibility.shouldTranslate(boost)).toBe(true);
  });

  it('detects the language when the post declares none', () => {
    expect(eligibility.shouldTranslate(post(FRENCH, null))).toBe(true);
  });

  describe('append mode', () => {
    it('appends for a learning language by default', () => {
      expect(eligibility.appends(post(FRENCH, 'fr'))).toBe(true);
    });

    it('replaces when the reader unchecked append for that language', () => {
      prefs.setAppendTranslation('fr', false);
      expect(eligibility.appends(post(FRENCH, 'fr'))).toBe(false);
    });

    it('never appends for a translate-all post', () => {
      // A post in a language you are not learning has no teaching value, so the
      // original is just noise beneath the translation.
      prefs.setTranslateAllForeign(true);
      expect(eligibility.appends(post('東京は今日はとても暑いですね', 'ja'))).toBe(false);
    });
  });
});

describe('ClientPrefs learning languages', () => {
  let prefs: ClientPrefs;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    prefs = TestBed.inject(ClientPrefs);
  });

  it('moves a language out of known when you start learning it', () => {
    // Left in both lists it would be simultaneously "never translate" and "always
    // translate", and known wins — so the learning entry would silently do nothing.
    prefs.setKnownLanguages(['en', 'is']);
    prefs.addLearningLanguage('is');
    expect(prefs.knownLanguages()).not.toContain('is');
    expect(prefs.learningLanguages()).toContain('is');
  });

  it('defaults to appending the translation under the original', () => {
    prefs.addLearningLanguage('eo');
    expect(prefs.appendsTranslation('eo')).toBe(true);
  });

  it('remembers append per language, so a triplet is opted into one at a time', () => {
    prefs.setLearningLanguages(['is', 'eo']);
    prefs.setAppendTranslation('is', false);
    expect(prefs.appendsTranslation('is')).toBe(false);
    expect(prefs.appendsTranslation('eo')).toBe(true);
  });

  it('forgets the append preference when the language is removed', () => {
    prefs.addLearningLanguage('eo');
    prefs.setAppendTranslation('eo', false);
    prefs.removeLearningLanguage('eo');
    prefs.addLearningLanguage('eo');
    // Re-adding starts from the learner default rather than resurrecting a stale
    // choice the user has no way to see.
    expect(prefs.appendsTranslation('eo')).toBe(true);
  });

  it('normalizes regioned codes', () => {
    prefs.addLearningLanguage('pt-BR');
    expect(prefs.learningLanguages()).toEqual(['pt']);
    expect(prefs.isLearning('pt_PT')).toBe(true);
  });

  it('survives a reload', () => {
    prefs.setLearningLanguages(['is', 'eo']);
    prefs.setAppendTranslation('is', false);
    // Persistence runs in an effect, which a test has to flush explicitly.
    TestBed.tick();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ClientPrefs);
    expect(reloaded.learningLanguages()).toEqual(['is', 'eo']);
    expect(reloaded.appendsTranslation('is')).toBe(false);
  });

  it('defaults automatic translation to off, and keeps a chosen mode', () => {
    expect(prefs.autoTranslateMode()).toBe('off');
    expect(prefs.translateAllForeign()).toBe(false);
    expect(prefs.autoTranslateUsesAi()).toBe(false);
    prefs.setAutoTranslateMode('hover');
    TestBed.tick();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ClientPrefs).autoTranslateMode()).toBe('hover');
  });

  it('falls back to off for a mode it does not recognise', () => {
    // This key decides whether the app spends money by itself, so a hand-edited or
    // future-version value must not be trusted into a spending state.
    localStorage.setItem(
      'mockingbird_client_prefs',
      JSON.stringify({ autoTranslateMode: 'everything-always' }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ClientPrefs).autoTranslateMode()).toBe('off');
  });

  it('ignores hand-edited nonsense in the stored append flags', () => {
    // Written straight to storage: this blob is hand-editable, so the guard has to
    // hold against values no setter would ever produce.
    localStorage.setItem(
      'mockingbird_client_prefs',
      JSON.stringify({ appendTranslation: { is: true, notalang: true, eo: 'yes' } }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ClientPrefs);
    expect(reloaded.appendTranslation()).toEqual({ is: true });
  });
});

describe('AutoTranslateEligibility.isAlreadyTargetLanguage', () => {
  let prefs: ClientPrefs;
  let eligibility: AutoTranslateEligibility;

  const ENGLISH = 'the quick brown fox is in the house and that is all we have here today';
  const FRENCH = 'le chat est dans la maison et je ne sais pas pourquoi mais il est là';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    prefs = TestBed.inject(ClientPrefs);
    eligibility = TestBed.inject(AutoTranslateEligibility);
  });

  it('is on by default — a call that returns the same text is never worth spending', () => {
    expect(prefs.skipSameLanguageTranslation()).toBe(true);
  });

  it('refuses when the post declares the target language', () => {
    expect(eligibility.isAlreadyTargetLanguage(post('anything at all', 'en'), 'en')).toBe(true);
  });

  it('refuses when undeclared text confidently reads as the target', () => {
    // The case that prompted this: clicking translate-to-English on obvious English.
    expect(eligibility.isAlreadyTargetLanguage(post(ENGLISH, null), 'en')).toBe(true);
  });

  it('allows a genuine translation', () => {
    expect(eligibility.isAlreadyTargetLanguage(post(FRENCH, 'fr'), 'en')).toBe(false);
  });

  /**
   * Reported: a plainly German post answered "this post already looks like
   * English, so translating it would return the same text" and offered a
   * settings page. The post declared `en`, and the declaration was trusted
   * unconditionally — clients default that field to the composer's UI locale, so
   * anyone posting in a second language ships the wrong tag.
   *
   * The costs are not symmetric. Wrongly spending one request is a rounding
   * error; wrongly refusing tells a reader something visibly false about the
   * text in front of them.
   */
  it('translates anyway when the text plainly is not what the post claims', () => {
    const GERMAN =
      'Die Nutzung der Musik war ihm doch verboten worden? Vermutlich genau deshalb gewählt';

    expect(eligibility.isAlreadyTargetLanguage(post(GERMAN, 'en'), 'en')).toBe(false);
  });

  it('still trusts a declaration the detector cannot second-guess', () => {
    // Too short to detect: the declaration stands, exactly as before.
    expect(eligibility.isAlreadyTargetLanguage(post('ok', 'en'), 'en')).toBe(true);
  });

  it('keeps refusing when the text agrees with the declaration', () => {
    expect(eligibility.isAlreadyTargetLanguage(post(ENGLISH, 'en'), 'en')).toBe(true);
  });

  it('allows when the language cannot be determined', () => {
    // Uncertainty resolves toward translating: withholding a translation someone needed
    // is a worse failure than spending one request.
    expect(eligibility.isAlreadyTargetLanguage(post('hi', null), 'en')).toBe(false);
  });

  it('matches regioned codes against the bare target', () => {
    expect(eligibility.isAlreadyTargetLanguage(post('anything', 'en-GB'), 'en')).toBe(true);
  });

  it('uses the boost target, not the booster', () => {
    const boost = post('', null, { reblog: post(ENGLISH, 'en') });
    expect(eligibility.isAlreadyTargetLanguage(boost, 'en')).toBe(true);
  });

  it('does nothing when switched off', () => {
    prefs.setSkipSameLanguageTranslation(false);
    expect(eligibility.isAlreadyTargetLanguage(post(ENGLISH, 'en'), 'en')).toBe(false);
  });
});
