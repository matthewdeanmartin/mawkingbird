import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiTranslate } from '../ai-translate';
import { Auth } from '../auth';
import { Status } from '../models';
import { saveMisskeyIdentity } from '../providers/misskey/misskey-identity-store';
import { FeedLanguageFilter } from '../trend-language-filter';
import { TranslationUsage } from '../translation-usage';
import { BrowserTranslator } from './browser-translator';
import { FreeTranslators } from './free-translators';
import { TranslationConnectors } from './translation-connectors';
import { plainText, RouteRequest, TranslationRouter } from './translation-router';

const SERVER = 'https://misskey.design';
const TRANSLATE = `${SERVER}/api/notes/translate`;

const note = (extra: Partial<Status> = {}) =>
  ({
    id: 'mk:n1',
    uri: `${SERVER}/notes/n1`,
    provider: 'misskey',
    providerRef: { server: SERVER, noteId: 'n1' },
    content: '<p>今日はいい天気ですね</p>',
    spoiler_text: '',
    language: null,
    account: { acct: 'a@misskey.design' },
    reblog: null,
    media_attachments: [],
    poll: null,
    ...extra,
  }) as unknown as Status;

/**
 * T1: a Misskey note goes to the reader's own Misskey server first (the
 * admin's DeepL, free to the reader), and translations are not paid for twice.
 */
describe('TranslationRouter with Misskey notes', () => {
  let http: HttpTestingController;
  let router: TranslationRouter;
  let detected: { language: string | null; candidates: string[] };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok' },
    );
    TestBed.inject(Auth).enterMisskey(key);
    router = TestBed.inject(TranslationRouter);
    detected = { language: 'ja', candidates: ['ja'] };
    vi.spyOn(TestBed.inject(FeedLanguageFilter), 'languageAssessment').mockImplementation(
      () => detected as never,
    );
    vi.spyOn(TestBed.inject(AiTranslate), 'targetLanguage').mockReturnValue('en');
    vi.spyOn(TestBed.inject(BrowserTranslator), 'supported').mockReturnValue(false);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  const request = (extra: Partial<RouteRequest> = {}): RouteRequest => ({
    status: note(),
    mode: 'manual',
    serverCanTranslate: false,
    aiAvailable: false,
    ...extra,
  });

  it('offers the translate button for a Misskey note even with no other engine on', () => {
    expect(router.hasFallback(false, note())).toBe(true);
    expect(router.hasFallback(false, null)).toBe(false);
  });

  it('asks the Misskey server first, as the active identity, for the target only', async () => {
    const pending = router.translate(request());
    const req = await vi.waitFor(() => http.expectOne(TRANSLATE));
    expect(req.request.body).toEqual({ noteId: 'n1', targetLang: 'en', i: 'tok' });
    req.flush({ sourceLang: 'JA', text: 'Nice weather today' });
    await expect(pending).resolves.toEqual({
      kind: 'text',
      engine: 'misskey',
      text: 'Nice weather today',
      source: 'ja',
      target: 'en',
    });
    expect(TestBed.inject(TranslationUsage).today('misskey')).toBe(1);
  });

  it('splits the content warning back out of the server answer', async () => {
    const pending = router.translate(request({ status: note({ spoiler_text: 'ネタバレ' }) }));
    (await vi.waitFor(() => http.expectOne(TRANSLATE))).flush({
      sourceLang: 'JA',
      text: 'Spoiler\n-----\nNice weather',
    });
    await expect(pending).resolves.toMatchObject({ text: 'Spoiler\n\nNice weather' });
  });

  it('remembers a server with no translator and moves on to the free engines', async () => {
    TestBed.inject(TranslationConnectors).setMyMemoryEnabled(true);
    const my = vi.spyOn(TestBed.inject(FreeTranslators), 'myMemory').mockResolvedValue('Nice');
    const pending = router.translate(request());
    (await vi.waitFor(() => http.expectOne(TRANSLATE))).flush(
      { error: { code: 'UNAVAILABLE', message: 'Translate of notes unavailable.' } },
      { status: 400, statusText: 'Bad Request' },
    );
    await expect(pending).resolves.toMatchObject({ kind: 'text', engine: 'mymemory' });
    expect(my).toHaveBeenCalledWith(expect.any(String), 'ja', 'en', '');
    // Not asked again this session.
    expect(router.misskeyCanTry(note({ id: 'mk:n2' }))).toBe(false);
  });

  it('lets the server detect the language when the local detector cannot (kanji only)', async () => {
    detected = { language: null, candidates: ['ja', 'zh'] };
    const pending = router.translate(request({ status: note({ content: '<p>天気晴朗</p>' }) }));
    (await vi.waitFor(() => http.expectOne(TRANSLATE))).flush({ sourceLang: 'ZH', text: 'Fine' });
    await expect(pending).resolves.toMatchObject({
      kind: 'text',
      engine: 'misskey',
      source: 'zh',
    });
  });

  it('still asks the reader when the server cannot help with an undetermined note', async () => {
    detected = { language: null, candidates: ['ja', 'zh'] };
    const pending = router.translate(request({ status: note({ content: '<p>天気晴朗</p>' }) }));
    (await vi.waitFor(() => http.expectOne(TRANSLATE))).flush(
      { error: { code: 'UNAVAILABLE' } },
      { status: 400, statusText: 'Bad Request' },
    );
    await expect(pending).resolves.toMatchObject({ kind: 'ask', candidates: ['ja', 'zh'] });
  });

  it('does not pay twice for the same note seen again (a renote)', async () => {
    const first = router.translate(request());
    (await vi.waitFor(() => http.expectOne(TRANSLATE))).flush({ sourceLang: 'JA', text: 'Nice' });
    await first;
    const again = await router.translate(request({ status: note({ id: 'mk:renote-of-n1' }) }));
    http.expectNone(TRANSLATE);
    expect(again).toMatchObject({ kind: 'text', engine: 'misskey', text: 'Nice' });
    expect(TestBed.inject(TranslationUsage).today('misskey')).toBe(1);
  });

  it('translates afresh when the text changed (an edit)', async () => {
    const first = router.translate(request());
    (await vi.waitFor(() => http.expectOne(TRANSLATE))).flush({ sourceLang: 'JA', text: 'Nice' });
    await first;
    const edited = router.translate(request({ status: note({ content: '<p>雨です</p>' }) }));
    (await vi.waitFor(() => http.expectOne(TRANSLATE))).flush({ sourceLang: 'JA', text: 'Rain' });
    await expect(edited).resolves.toMatchObject({ text: 'Rain' });
  });

  it('bypasses the cache when the reader picks a source', async () => {
    const first = router.translate(request());
    (await vi.waitFor(() => http.expectOne(TRANSLATE))).flush({ sourceLang: 'JA', text: 'Nice' });
    await first;
    const picked = router.translate(request({ source: 'ja' }));
    (await vi.waitFor(() => http.expectOne(TRANSLATE))).flush({
      sourceLang: 'JA',
      text: 'Nice 2',
    });
    await expect(picked).resolves.toMatchObject({ text: 'Nice 2' });
  });

  it('never sends a Mastodon post to the Misskey server', async () => {
    const mastodonPost = note({ provider: undefined, providerRef: undefined, id: '42' });
    expect(router.misskeyCanTry(mastodonPost)).toBe(false);
    await router.translate(request({ status: mastodonPost }));
    http.expectNone(TRANSLATE);
  });
});

describe('plainText', () => {
  it('adds image descriptions and poll choices as marked lines', () => {
    const status = note({
      spoiler_text: 'CW',
      media_attachments: [
        { id: 'm1', type: 'image', url: '', preview_url: '', description: '猫の写真' },
        { id: 'm2', type: 'image', url: '', preview_url: '', description: '  ' },
      ],
      poll: {
        id: 'p',
        expires_at: null,
        expired: false,
        multiple: false,
        votes_count: 0,
        voters_count: 0,
        voted: false,
        own_votes: [],
        options: [
          { title: 'いぬ', votes_count: 0 },
          { title: 'ねこ', votes_count: 0 },
        ],
      },
    });
    expect(plainText(status)).toBe('CW\n\n今日はいい天気ですね\n\n🖼 猫の写真\n☐ いぬ\n☐ ねこ');
  });

  it('is unchanged for a post with neither', () => {
    expect(plainText(note())).toBe('今日はいい天気ですね');
  });
});
