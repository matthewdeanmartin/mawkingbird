import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientPrefs } from '../client-prefs';
import { Drafts } from '../drafts';
import { Status } from '../models';
import { Auth } from '../auth';
import { Server } from '../server';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { CorsProxySettings } from '../providers/cors-proxy/cors-proxy-settings';
import { ShortenerSettings } from '../providers/shortener/shortener-settings';
import { Compose, PostTarget, describePostFailure } from './compose';
import { MataroaSettings } from '../providers/mataroa/mataroa-settings';
import { BloggerSession } from '../providers/blogger/blogger-session';
import { HugoSettings } from '../providers/hugo/hugo-settings';
import { HugoEdit, HugoEditSession } from '../providers/hugo/hugo-edit-session';
import { HugoDeployWatch } from '../providers/hugo/hugo-deploy-watch';
import { enableProxyFlags } from '../testing/enable-proxy-flags';

/** Edit codes are stored apart from the records — see storage-registry.ts. */
function storedEditKeys(): Record<string, string> {
  return JSON.parse(localStorage.getItem('mockingbird_paste_edit_keys') ?? '{}');
}

/** Expose the protected internals for white-box testing. */
interface ComposeInternals {
  text: WritableSignal<string>;
  previewVisible: Signal<boolean>;
  submitting: WritableSignal<boolean>;
  uploading: WritableSignal<boolean>;
  visibility: WritableSignal<string>;
  cwOpen: WritableSignal<boolean>;
  spoilerText: WritableSignal<string>;
  sensitive: WritableSignal<boolean>;
  // `file` is the original bytes, kept so a Bluesky leg can upload them to its
  // own repo — Mastodon's upload is not reusable there.
  media: WritableSignal<{ media: { id: string }; description: string; file?: File }[]>;
  mediaNotice: WritableSignal<string>;
  uploadFiles(files: File[]): void;
  pollOpen: WritableSignal<boolean>;
  pollOptions: WritableSignal<string[]>;
  pollMultiple: WritableSignal<boolean>;
  pollExpiresIn: WritableSignal<number>;
  canSubmit: Signal<boolean>;
  altTextNote: Signal<string | null>;
  altTextMissing: Signal<boolean>;
  canAttachMedia: Signal<boolean>;
  canAddPoll: Signal<boolean>;
  countdown: Signal<number | null>;
  scheduleOpen: WritableSignal<boolean>;
  scheduleAt: WritableSignal<string>;
  thread: WritableSignal<string[]>;
  segments: Signal<string[]>;
  overLimit: Signal<boolean>;
  addThreadBox(): void;
  setThreadText(index: number, value: string): void;
  removeThreadBox(index: number): void;
  cancelSend(): void;
  publishNow(): void;
  target: WritableSignal<PostTarget>;
  pasteLanguage: WritableSignal<string>;
  pasteExpiry: WritableSignal<string>;
  pasteProviderId: WritableSignal<string>;
  onPasteProviderChange(providerId: string): void;
  onPasteExpiryChange(expiry: string): void;
  onTargetChange(target: PostTarget): void;
  onVisibilityChange(visibility: string): void;
  cancelHugoEdit(): void;
  pendingSelfCleanup: WritableSignal<string | null>;
  selfCleanupError: WritableSignal<string | null>;
  draftSaved: WritableSignal<boolean>;
  draftSaveFailed: WritableSignal<boolean>;
  saveDraft(): void;
  downloadDraft(): void;
  deleteSelfDraftCopy(): void;
  showTargetPicker: Signal<boolean>;
  crossPostError: Signal<string | null>;
  postError: Signal<{ message: string } | null>;
  toggleCw(): void;
  togglePoll(): void;
  addPollOption(): void;
  removePollOption(index: number): void;
  setPollOption(index: number, value: string): void;
  setMediaDescription(index: number, description: string): void;
  removeMedia(index: number): void;
  submit(): void;
  blogDraft: WritableSignal<boolean>;
  postLanguage: WritableSignal<string>;
  langMismatch: WritableSignal<{ picked: string; detected: string } | null>;
  onLanguageChange(code: string): void;
  dismissLangMismatch(): void;
  pkmWarning: WritableSignal<string[] | null>;
  confirmPkmAndSend(): void;
  dismissPkmWarning(): void;
  showReplyMentionHint: Signal<boolean>;
  shortenError: WritableSignal<string | null>;
  shortenerConsentPrompt: WritableSignal<{
    carriesCredential: boolean;
    proxy: { label: string };
  } | null>;
  shortenLinks(): Promise<void>;
  acceptShortenerConsent(): Promise<void>;
  declineShortenerConsent(): void;
}

function internals(fixture: ComponentFixture<Compose>): ComposeInternals {
  return fixture.componentInstance as unknown as ComposeInternals;
}

describe('Compose', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    // The Blogger token lives in sessionStorage; without this a test that links
    // it leaks a connected state into every test that follows.
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    // These specs use a third-party proxy as the vehicle for testing proxy
    enableProxyFlags();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setUp(): ComponentFixture<Compose> {
    const fixture = TestBed.createComponent(Compose);
    fixture.detectChanges();
    return fixture;
  }

  // ---------------------------------------------------------------- alt text

  describe('alt text', () => {
    function attach(f: ComponentFixture<Compose>, type: string, description = ''): void {
      internals(f).media.set([
        { media: { id: 'm1', type, description: null } as never, description },
      ]);
      f.detectChanges();
    }

    /**
     * Advisory unless the user asked for the friction. Blocking a send on a
     * setting nobody turned on is how a composer trains people to attach
     * nothing rather than to describe what they attach.
     */
    it('advises without blocking when the requirement is off', () => {
      TestBed.inject(ClientPrefs).requireAltText.set(false);
      const f = setUp();
      internals(f).text.set('a post with a picture');
      attach(f, 'image');

      expect(internals(f).altTextNote()).toContain('Screen readers will skip');
      expect(internals(f).altTextMissing()).toBe(false);
      expect(internals(f).canSubmit()).toBe(true);
    });

    it('blocks sending once the user opts into the requirement', () => {
      TestBed.inject(ClientPrefs).requireAltText.set(true);
      const f = setUp();
      internals(f).text.set('a post with a picture');
      attach(f, 'image');

      expect(internals(f).altTextMissing()).toBe(true);
      expect(internals(f).canSubmit()).toBe(false);
    });

    it('is satisfied by a description', () => {
      TestBed.inject(ClientPrefs).requireAltText.set(true);
      const f = setUp();
      internals(f).text.set('a post with a picture');
      attach(f, 'image', 'a photograph of a cat');

      expect(internals(f).altTextNote()).toBeNull();
      expect(internals(f).canSubmit()).toBe(true);
    });

    /** An upload the server could not place may never publish; nagging is noise. */
    it('does not nag about an attachment the server could not place', () => {
      TestBed.inject(ClientPrefs).requireAltText.set(true);
      const f = setUp();
      internals(f).text.set('a post with a mystery file');
      attach(f, 'unknown');

      expect(internals(f).altTextMissing()).toBe(false);
      expect(internals(f).canSubmit()).toBe(true);
    });
  });

  // ---------------------------------------------------------------- canSubmit

  it('canSubmit is false when text is empty', () => {
    const f = setUp();
    expect(internals(f).canSubmit()).toBe(false);
  });

  it('canSubmit is true when text has non-whitespace content', () => {
    const f = setUp();
    internals(f).text.set('Hello world');
    expect(internals(f).canSubmit()).toBe(true);
  });

  it('canSubmit is false when text is only whitespace', () => {
    const f = setUp();
    internals(f).text.set('   ');
    expect(internals(f).canSubmit()).toBe(false);
  });

  it('canSubmit is false while submitting', () => {
    const f = setUp();
    internals(f).text.set('Hello');
    internals(f).submitting.set(true);
    expect(internals(f).canSubmit()).toBe(false);
  });

  it('canSubmit is false while uploading media', () => {
    const f = setUp();
    internals(f).text.set('Hello');
    internals(f).uploading.set(true);
    expect(internals(f).canSubmit()).toBe(false);
  });

  // ---------------------------------------------------------- link shortening

  // A credentialed provider rather than is.gd, and that swap is the point. is.gd
  // answers browsers directly, so it is marked `corsOpen` and never offers a
  // proxy at all; the keyed shorteners genuinely refuse browsers, which is what
  // makes them the honest subject for the consent flow. Dub specifically because
  // it needs only a key — Short.io additionally requires a domain.
  it('asks before the proxy sees a credentialed request, then retries after consent', async () => {
    const settings = TestBed.inject(ShortenerSettings);
    settings.setKey('dub', 'dub_test');
    settings.activate('dub');
    TestBed.inject(CorsProxySettings).select('allorigins');
    const f = setUp();
    const original = 'See https://example.com/a-very-long-destination-that-needs-shortening';
    internals(f).text.set(original);

    const firstAttempt = internals(f).shortenLinks();
    httpMock
      .expectOne((request) => request.url.startsWith('https://api.dub.co'))
      .error(new ProgressEvent('error'), { status: 0 });
    await firstAttempt;

    // A key is on the line here, so the disclosure has to say so.
    expect(internals(f).shortenerConsentPrompt()?.carriesCredential).toBe(true);
    expect(internals(f).text()).toBe(original);
    httpMock.expectNone((request) => request.url.startsWith('https://api.allorigins.win/raw'));

    const retry = internals(f).acceptShortenerConsent();
    httpMock
      .expectOne((request) => request.url.startsWith('https://api.dub.co'))
      .error(new ProgressEvent('error'), { status: 0 });
    httpMock
      .expectOne((request) => request.url.startsWith('https://api.allorigins.win/raw'))
      .flush({ shortLink: 'https://dub.sh/abc123', id: 'x1', key: 'abc123' });
    await retry;

    expect(internals(f).text()).toBe('See https://dub.sh/abc123');
    expect(internals(f).shortenerConsentPrompt()).toBeNull();
  });

  it('keeps the post unchanged and suggests alternatives when proxy consent is declined', async () => {
    const settings = TestBed.inject(ShortenerSettings);
    settings.setKey('dub', 'dub_test');
    settings.activate('dub');
    TestBed.inject(CorsProxySettings).select('allorigins');
    const f = setUp();
    const original = 'See https://example.com/a-very-long-destination-that-needs-shortening';
    internals(f).text.set(original);

    const attempt = internals(f).shortenLinks();
    httpMock
      .expectOne((request) => request.url.startsWith('https://api.dub.co'))
      .error(new ProgressEvent('error'), { status: 0 });
    await attempt;
    internals(f).declineShortenerConsent();

    expect(internals(f).text()).toBe(original);
    expect(internals(f).shortenError()).toContain('different CORS proxy');
  });

  it('canSubmit is true with an open poll that has at least 2 non-empty options', () => {
    const f = setUp();
    internals(f).pollOpen.set(true);
    internals(f).pollOptions.set(['Option A', 'Option B']);
    expect(internals(f).canSubmit()).toBe(true);
  });

  it('canSubmit is false with a poll where fewer than 2 options are filled', () => {
    const f = setUp();
    internals(f).pollOpen.set(true);
    internals(f).pollOptions.set(['Only one', '']);
    expect(internals(f).canSubmit()).toBe(false);
  });

  // ---------------------------------------------------------------- canAttachMedia / canAddPoll

  it('canAttachMedia is true when no poll is open', () => {
    const f = setUp();
    internals(f).pollOpen.set(false);
    expect(internals(f).canAttachMedia()).toBe(true);
  });

  it('canAttachMedia is false when poll is open', () => {
    const f = setUp();
    internals(f).pollOpen.set(true);
    expect(internals(f).canAttachMedia()).toBe(false);
  });

  it('canAddPoll is true when no media is attached', () => {
    const f = setUp();
    expect(internals(f).canAddPoll()).toBe(true);
  });

  it('canAddPoll is false when media is attached', () => {
    const f = setUp();
    internals(f).media.set([{ media: { id: '1' }, description: '' }]);
    expect(internals(f).canAddPoll()).toBe(false);
  });

  // ---------------------------------------------------------------- toggleCw

  it('toggleCw opens the CW field', () => {
    const f = setUp();
    expect(internals(f).cwOpen()).toBe(false);
    internals(f).toggleCw();
    expect(internals(f).cwOpen()).toBe(true);
  });

  it('toggleCw closes the CW field and clears the spoiler text', () => {
    const f = setUp();
    internals(f).toggleCw();
    internals(f).spoilerText.set('spoiler!');
    internals(f).toggleCw();
    expect(internals(f).cwOpen()).toBe(false);
    expect(internals(f).spoilerText()).toBe('');
  });

  // ---------------------------------------------------------------- togglePoll

  it('togglePoll opens the poll section', () => {
    const f = setUp();
    internals(f).togglePoll();
    expect(internals(f).pollOpen()).toBe(true);
  });

  it('togglePoll closes the poll and resets options', () => {
    const f = setUp();
    internals(f).togglePoll();
    internals(f).pollOptions.set(['A', 'B', 'C']);
    internals(f).pollMultiple.set(true);
    internals(f).togglePoll();
    expect(internals(f).pollOpen()).toBe(false);
    expect(internals(f).pollOptions()).toEqual(['', '']);
    expect(internals(f).pollMultiple()).toBe(false);
  });

  // ---------------------------------------------------------------- poll option management

  it('addPollOption appends an empty option', () => {
    const f = setUp();
    internals(f).addPollOption();
    expect(internals(f).pollOptions()).toEqual(['', '', '']);
  });

  it('addPollOption does nothing when 4 options exist', () => {
    const f = setUp();
    internals(f).pollOptions.set(['A', 'B', 'C', 'D']);
    internals(f).addPollOption();
    expect(internals(f).pollOptions()).toHaveLength(4);
  });

  it('removePollOption removes the option at the given index', () => {
    const f = setUp();
    internals(f).pollOptions.set(['A', 'B', 'C']);
    internals(f).removePollOption(1);
    expect(internals(f).pollOptions()).toEqual(['A', 'C']);
  });

  it('removePollOption does nothing when only 2 options remain', () => {
    const f = setUp();
    // Default starts with ['', ''].
    internals(f).removePollOption(0);
    expect(internals(f).pollOptions()).toEqual(['', '']);
  });

  it('setPollOption updates the value at the correct index', () => {
    const f = setUp();
    internals(f).setPollOption(0, 'Yes');
    internals(f).setPollOption(1, 'No');
    expect(internals(f).pollOptions()).toEqual(['Yes', 'No']);
  });

  // ---------------------------------------------------------------- media management

  it('setMediaDescription updates the description for the correct item', () => {
    const f = setUp();
    internals(f).media.set([
      { media: { id: '1' }, description: '' },
      { media: { id: '2' }, description: '' },
    ]);
    internals(f).setMediaDescription(0, 'A cat');
    expect(internals(f).media()[0].description).toBe('A cat');
    expect(internals(f).media()[1].description).toBe('');
  });

  it('removeMedia removes the attachment at the given index', () => {
    const f = setUp();
    internals(f).media.set([
      { media: { id: '1' }, description: '' },
      { media: { id: '2' }, description: '' },
    ]);
    internals(f).removeMedia(0);
    expect(
      internals(f)
        .media()
        .map((m) => m.media.id),
    ).toEqual(['2']);
  });

  // ---------------------------------------------------------------- submit()

  it('submit() does nothing when canSubmit is false', () => {
    const f = setUp();
    // text is empty, so canSubmit is false
    internals(f).submit();
    httpMock.expectNone('/api/v1/statuses');
  });

  it('submit() POSTs the trimmed text and emits the posted status', () => {
    const f = setUp();
    const posted: Status[] = [];
    f.componentInstance.posted.subscribe((s) => posted.push(s));

    internals(f).text.set('  Hello world  ');
    internals(f).submit();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.status).toBe('Hello world');

    const stub = { id: '100', content: '<p>Hello world</p>' } as Status;
    req.flush(stub);

    expect(posted).toHaveLength(1);
    expect(posted[0].id).toBe('100');
  });

  // ------------------------------------------------------- PKM publish warning

  it('warns instead of publishing when the post is tagged as a to-do', () => {
    const f = setUp();
    internals(f).text.set('answer this later #todo');
    internals(f).submit();

    // The absence of the request is the only thing that really proves it.
    httpMock.expectNone('/api/v1/statuses');
    expect(internals(f).pkmWarning()).toEqual(['todo']);
  });

  it('names every kind the post carries', () => {
    const f = setUp();
    internals(f).text.set('#note and #todo');
    internals(f).submit();

    expect(internals(f).pkmWarning()).toEqual(['todo', 'note']);
    httpMock.expectNone('/api/v1/statuses');
  });

  it('publishes when the warning is confirmed', () => {
    const f = setUp();
    internals(f).text.set('deliberately public #note');
    internals(f).submit();
    internals(f).confirmPkmAndSend();

    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' } as Status);
    expect(internals(f).pkmWarning()).toBeNull();
  });

  it('publishes nothing when the warning is dismissed', () => {
    const f = setUp();
    internals(f).text.set('not ready #todo');
    internals(f).submit();
    internals(f).dismissPkmWarning();

    httpMock.expectNone('/api/v1/statuses');
    expect(internals(f).pkmWarning()).toBeNull();
  });

  it('does not warn about an untagged post', () => {
    const f = setUp();
    internals(f).text.set('an ordinary post');
    internals(f).submit();

    expect(internals(f).pkmWarning()).toBeNull();
    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' } as Status);
  });

  it('does not warn when the user turned the warning off', () => {
    TestBed.inject(ClientPrefs).warnOnPkmPublish.set(false);
    const f = setUp();
    internals(f).text.set('publishing notes on purpose #note');
    internals(f).submit();

    expect(internals(f).pkmWarning()).toBeNull();
    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' } as Status);
  });

  it('respects a custom vocabulary in both directions', () => {
    TestBed.inject(ClientPrefs).setPkmVocabulary({ note: [], todo: ['aufgabe'], cal: [] });
    const f = setUp();

    // The English word is no longer a to-do...
    internals(f).text.set('#todo');
    internals(f).submit();
    expect(internals(f).pkmWarning()).toBeNull();
    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' } as Status);

    // ...and the configured one is.
    internals(f).text.set('#aufgabe');
    internals(f).submit();
    expect(internals(f).pkmWarning()).toEqual(['todo']);
    httpMock.expectNone('/api/v1/statuses');
  });

  it('submit() resets the composer after a successful post', () => {
    const f = setUp();
    internals(f).text.set('Test post');
    internals(f).cwOpen.set(true);
    internals(f).spoilerText.set('cw');
    internals(f).submit();

    const req = httpMock.expectOne('/api/v1/statuses');
    req.flush({ id: '1' });

    expect(internals(f).text()).toBe('');
    expect(internals(f).cwOpen()).toBe(false);
    expect(internals(f).spoilerText()).toBe('');
    expect(internals(f).submitting()).toBe(false);
  });

  it('submit() clears the submitting flag on HTTP error', () => {
    const f = setUp();
    internals(f).text.set('Test post');
    internals(f).submit();

    httpMock.expectOne('/api/v1/statuses').flush('', { status: 500, statusText: 'Error' });

    expect(internals(f).submitting()).toBe(false);
  });

  it('submit() includes spoiler_text when the CW is open and non-empty', () => {
    const f = setUp();
    internals(f).text.set('Post text');
    internals(f).cwOpen.set(true);
    internals(f).spoilerText.set('Content warning');
    internals(f).submit();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.body.spoiler_text).toBe('Content warning');
    req.flush({ id: '1' });
  });

  it('submit() omits spoiler_text when CW is open but text is whitespace-only', () => {
    const f = setUp();
    internals(f).text.set('Post text');
    internals(f).cwOpen.set(true);
    internals(f).spoilerText.set('   ');
    internals(f).submit();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.body.spoiler_text).toBeUndefined();
    req.flush({ id: '1' });
  });

  it('submit() includes media_ids when media is attached', () => {
    const f = setUp();
    internals(f).text.set('Photo post');
    internals(f).media.set([
      { media: { id: 'media-1' }, description: '' },
      { media: { id: 'media-2' }, description: '' },
    ]);
    internals(f).submit();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.body.media_ids).toEqual(['media-1', 'media-2']);
    req.flush({ id: '1' });
  });

  it('waits for every media description before creating a status', () => {
    const f = setUp();
    internals(f).text.set('Photo post');
    internals(f).media.set([
      { media: { id: 'media-1' }, description: 'First image' },
      { media: { id: 'media-2' }, description: 'Second image' },
    ]);
    internals(f).submit();

    const first = httpMock.expectOne('/api/v1/media/media-1');
    const second = httpMock.expectOne('/api/v1/media/media-2');
    httpMock.expectNone('/api/v1/statuses');

    first.flush({ id: 'media-1' });
    httpMock.expectNone('/api/v1/statuses');
    second.flush({ id: 'media-2' });

    const post = httpMock.expectOne('/api/v1/statuses');
    expect(post.request.body.media_ids).toEqual(['media-1', 'media-2']);
    post.flush({ id: '1' });
  });

  it.each(['audience', 'destination', 'text', 'attachments', 'server', 'account', 'destroy'])(
    'does not publish a changed %s after attachment metadata finishes',
    (change) => {
      linkBsky();
      const f = setUp();
      internals(f).onTargetChange('both');
      internals(f).text.set('Pending writing');
      internals(f).media.set([{ media: { id: 'media-1' }, description: 'Image' }]);
      internals(f).submit();
      const metadata = httpMock.expectOne('/api/v1/media/media-1');
      switch (change) {
        case 'audience':
          internals(f).onVisibilityChange('private');
          break;
        case 'destination':
          internals(f).onTargetChange('fedi');
          break;
        case 'text':
          internals(f).text.set('Edited writing');
          break;
        case 'attachments':
          internals(f).removeMedia(0);
          break;
        case 'server':
          TestBed.inject(Server).setBaseUrl('https://other.example');
          break;
        case 'account':
          TestBed.inject(Auth).account.set({ id: 'other' } as never);
          break;
        case 'destroy':
          f.destroy();
          break;
      }
      metadata.flush({ id: 'media-1' });
      httpMock.expectNone(CREATE_RECORD);
      httpMock.expectNone('/api/v1/statuses');
      if (change !== 'destroy') {
        expect(internals(f).submitting()).toBe(false);
        expect(internals(f).text()).not.toBe('');
        expect(internals(f).crossPostError()).toContain('Review your post');
      }
    },
  );

  it('does not add a public Bluesky leg to a private Fedi post during metadata saving', () => {
    linkBsky();
    const f = setUp();
    internals(f).text.set('Private writing');
    internals(f).onVisibilityChange('private');
    internals(f).media.set([{ media: { id: 'media-1' }, description: 'Image' }]);
    internals(f).submit();
    const metadata = httpMock.expectOne('/api/v1/media/media-1');
    internals(f).onTargetChange('both');
    internals(f).removeMedia(0);
    metadata.flush({ id: 'media-1' });
    httpMock.expectNone(CREATE_RECORD);
    httpMock.expectNone('/api/v1/statuses');
    expect(internals(f).visibility()).toBe('private');
    expect(internals(f).text()).toBe('Private writing');
  });

  it('keeps text, attachment, and description when a media description update fails', () => {
    const f = setUp();
    internals(f).text.set('A recoverable post');
    internals(f).media.set([{ media: { id: 'media-1' }, description: 'A careful description' }]);
    internals(f).submit();

    httpMock
      .expectOne('/api/v1/media/media-1')
      .flush({ error: 'metadata unavailable' }, { status: 503, statusText: 'Unavailable' });

    httpMock.expectNone('/api/v1/statuses');
    expect(internals(f).submitting()).toBe(false);
    expect(internals(f).text()).toBe('A recoverable post');
    expect(internals(f).media()).toHaveLength(1);
    expect(internals(f).media()[0].media.id).toBe('media-1');
    expect(internals(f).media()[0].description).toBe('A careful description');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('nothing was posted');

    internals(f).submit();
    httpMock.expectOne('/api/v1/media/media-1').flush({ id: 'media-1' });
    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' });
  });

  it('waits for media descriptions before creating a scheduled status', () => {
    const f = setUp();
    internals(f).text.set('Later with alt text');
    internals(f).media.set([{ media: { id: 'media-1' }, description: 'Sunset' }]);
    internals(f).scheduleOpen.set(true);
    internals(f).scheduleAt.set(new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 16));
    internals(f).submit();

    const metadata = httpMock.expectOne('/api/v1/media/media-1');
    httpMock.expectNone('/api/v1/statuses');
    metadata.flush({ id: 'media-1' });
    const post = httpMock.expectOne('/api/v1/statuses');
    expect(post.request.body.scheduled_at).toBeDefined();
    post.flush({ id: 'scheduled-1', params: {} });
  });

  it('submit() includes poll params when poll is open and valid', () => {
    const f = setUp();
    internals(f).pollOpen.set(true);
    internals(f).pollOptions.set(['Yes', 'No']);
    internals(f).pollExpiresIn.set(3600);
    internals(f).submit();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.body.poll).toEqual({
      options: ['Yes', 'No'],
      expires_in: 3600,
      multiple: false,
    });
    req.flush({ id: '1' });
  });

  // ---------------------------------------------------------------- thread boxes

  it('renders the complete thread hint with a live count and translation-owned order', () => {
    const f = setUp();
    internals(f).text.set('first');
    internals(f).thread.set(['second']);
    f.detectChanges();
    const hint = (): HTMLElement => f.nativeElement.querySelector('.thread-hint.muted');
    expect(hint().textContent?.trim()).toBe('Will post as a thread of 2.');

    const transloco = TestBed.inject(TranslocoService);
    const original = transloco.getTranslation('en');
    try {
      transloco.setTranslation({ 'compose.threadSummary': '{{count}} <b>items</b>!' }, 'en');
      internals(f).thread.set(['second', 'third']);
      f.detectChanges();
      expect(hint().textContent?.trim()).toBe('3 <b>items</b>!');
      expect(hint().querySelector('b')).toBeNull();
    } finally {
      transloco.setTranslation(original, 'en', { merge: false });
    }
  });

  it('thread boxes post as a chained self-reply thread', () => {
    const f = setUp();
    const posted: Status[] = [];
    f.componentInstance.posted.subscribe((s) => posted.push(s));

    internals(f).text.set('first post');
    internals(f).addThreadBox();
    internals(f).setThreadText(0, 'second post');
    internals(f).addThreadBox();
    internals(f).setThreadText(1, 'third post');
    internals(f).submit();

    const first = httpMock.expectOne('/api/v1/statuses');
    expect(first.request.body.status).toBe('first post');
    expect(first.request.body.in_reply_to_id).toBeUndefined();
    first.flush({ id: 'root' });

    const second = httpMock.expectOne('/api/v1/statuses');
    expect(second.request.body.status).toBe('second post');
    expect(second.request.body.in_reply_to_id).toBe('root');
    second.flush({ id: 'child' });

    const third = httpMock.expectOne('/api/v1/statuses');
    expect(third.request.body.status).toBe('third post');
    expect(third.request.body.in_reply_to_id).toBe('child');
    third.flush({ id: 'tail' });

    // The root status (not the tail) is what containers receive.
    expect(posted).toHaveLength(1);
    expect(posted[0].id).toBe('root');
    expect(internals(f).text()).toBe('');
    expect(internals(f).thread()).toEqual([]);
  });

  it('empty thread boxes are skipped when posting', () => {
    const f = setUp();
    internals(f).text.set('only real post');
    internals(f).addThreadBox();
    internals(f).submit();

    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' });
    httpMock.expectNone('/api/v1/statuses');
  });

  it('over-limit text blocks posting instead of auto-splitting', () => {
    const f = setUp();
    internals(f).text.set('x'.repeat(501));

    expect(internals(f).overLimit()).toBe(true);
    expect(internals(f).canSubmit()).toBe(false);
    internals(f).submit();
    httpMock.expectNone('/api/v1/statuses');
  });

  it('short text posts as a single unmarked status', () => {
    const f = setUp();
    internals(f).text.set('just a short post');
    internals(f).submit();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.body.status).toBe('just a short post');
    req.flush({ id: '1' });
    httpMock.expectNone('/api/v1/statuses');
  });

  // ---------------------------------------------------------------- undo send

  function enableUndoSend(): void {
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setConfirmBeforePost(true);
    prefs.setDelayedSend(true);
  }

  it('undo-send asks for confirmation and defers the POST by 30 seconds', () => {
    vi.useFakeTimers();
    enableUndoSend();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const f = setUp();
    internals(f).text.set('risky post');
    internals(f).submit();

    expect(confirmSpy).toHaveBeenCalledWith('Do you really want to post that?');
    httpMock.expectNone('/api/v1/statuses');
    expect(internals(f).countdown()).toBe(30);

    vi.advanceTimersByTime(29_000);
    httpMock.expectNone('/api/v1/statuses');
    expect(internals(f).countdown()).toBe(1);

    vi.advanceTimersByTime(1_000);
    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.body.status).toBe('risky post');
    req.flush({ id: '1' });
    expect(internals(f).countdown()).toBeNull();
  });

  it('declining the confirmation aborts without posting and keeps the draft', () => {
    enableUndoSend();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const f = setUp();
    internals(f).text.set('never mind');
    internals(f).submit();

    httpMock.expectNone('/api/v1/statuses');
    expect(internals(f).text()).toBe('never mind');
    expect(internals(f).countdown()).toBeNull();
  });

  it('cancelSend() stops the countdown and keeps the draft', () => {
    vi.useFakeTimers();
    enableUndoSend();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const f = setUp();
    internals(f).text.set('second thoughts');
    internals(f).submit();
    vi.advanceTimersByTime(10_000);
    internals(f).cancelSend();
    vi.advanceTimersByTime(60_000);

    httpMock.expectNone('/api/v1/statuses');
    expect(internals(f).text()).toBe('second thoughts');
    expect(internals(f).countdown()).toBeNull();
  });

  it('publishNow() during the countdown posts immediately', () => {
    vi.useFakeTimers();
    enableUndoSend();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const f = setUp();
    internals(f).text.set('impatient post');
    internals(f).submit();
    vi.advanceTimersByTime(5_000);
    internals(f).publishNow();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.body.status).toBe('impatient post');
    req.flush({ id: '1' });
    expect(internals(f).countdown()).toBeNull();

    // The dead timer must not fire a second post.
    vi.advanceTimersByTime(60_000);
    httpMock.expectNone('/api/v1/statuses');
  });

  it('confirm-only (no delay) posts immediately after an accepted confirmation', () => {
    TestBed.inject(ClientPrefs).setConfirmBeforePost(true);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const f = setUp();
    internals(f).text.set('confirmed post');
    internals(f).submit();

    expect(confirmSpy).toHaveBeenCalled();
    expect(internals(f).countdown()).toBeNull();
    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' });
  });

  it('delay-only (no confirm) starts the countdown without asking', () => {
    vi.useFakeTimers();
    TestBed.inject(ClientPrefs).setDelayedSend(true);
    const confirmSpy = vi.spyOn(window, 'confirm');

    const f = setUp();
    internals(f).text.set('slow post');
    internals(f).submit();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(internals(f).countdown()).toBe(30);
    vi.advanceTimersByTime(30_000);
    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' });
  });

  it('undo-send disabled: posts immediately without confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const f = setUp();
    internals(f).text.set('normal post');
    internals(f).submit();

    expect(confirmSpy).not.toHaveBeenCalled();
    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' });
  });

  // -------------------------------------------------------------- post target

  const CREATE_RECORD = 'https://bsky.social/xrpc/com.atproto.repo.createRecord';

  function linkBsky(): void {
    TestBed.inject(BlueskySession).session.set({
      service: 'https://bsky.social',
      handle: 'me.bsky.social',
      did: 'did:plc:me',
      accessJwt: 'jwt',
      refreshJwt: 'refresh',
    });
  }

  it('shows the target picker for Paste and posts to Fedi by default without Bluesky', () => {
    const f = setUp();
    expect(internals(f).showTargetPicker()).toBe(true);
    expect(internals(f).target()).toBe('fedi');
    internals(f).text.set('plain post');
    internals(f).submit();
    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' });
  });

  it('defaults to Fedi even when Bluesky is linked', () => {
    // A *connector* is a place you can also post; it does not change where the
    // composer opens. Contrast the Bluesky-primary case below, where Bluesky is
    // not a second destination but the account itself.
    linkBsky();
    const f = setUp();
    expect(internals(f).showTargetPicker()).toBe(true);
    expect(internals(f).target()).toBe('fedi');
    internals(f).text.set('fedi post');
    internals(f).submit();
    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' });
    httpMock.expectNone(CREATE_RECORD);
  });

  it('keeps replies Fedi-only even if a stale top-level target says Both', () => {
    linkBsky();
    const f = TestBed.createComponent(Compose);
    f.componentRef.setInput('inReplyToId', 'parent-1');
    f.detectChanges();
    internals(f).target.set('both');
    internals(f).text.set('reply stays here');
    internals(f).submit();

    httpMock.expectNone(CREATE_RECORD);
    const request = httpMock.expectOne('/api/v1/statuses');
    expect(request.request.body.in_reply_to_id).toBe('parent-1');
    request.flush({ id: 'reply-1' });
  });

  it('defaults to Bluesky when Bluesky is the account', () => {
    // Every quick post used to open aimed at Mastodon for a Bluesky-primary
    // account — the one network they actually are — so posting where they live
    // took a correction every single time.
    linkBsky();
    vi.spyOn(TestBed.inject(Auth), 'isBlueskyPrimary', 'get').mockReturnValue(true);

    expect(internals(setUp()).target()).toBe('bsky');
  });

  it('falls back to Fedi when a Bluesky-primary session cannot post', () => {
    // Through `restorableTarget`, not a bare 'bsky': with stale or missing
    // Bluesky credentials the composer must not open on a target it cannot
    // submit to. No linkBsky() here, so the session is absent.
    vi.spyOn(TestBed.inject(Auth), 'isBlueskyPrimary', 'get').mockReturnValue(true);

    expect(internals(setUp()).target()).not.toBe('bsky');
  });

  /** A finished Blogger OAuth flow with a blog chosen, driven through real state. */
  function linkBlogger(name = 'My Blog'): void {
    const session = TestBed.inject(BloggerSession);
    session.adoptToken('tok', 3600);
    session.chooseBlog('123', name, 'https://my.blogspot.com/');
  }

  it('offers Mataroa and Blogger as separate, simultaneous blog targets', () => {
    TestBed.inject(MataroaSettings).connect('key', 'https://writer.mataroa.blog/');
    linkBlogger();

    const f = setUp();
    const values = [
      ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
        '.target-select option',
      ),
    ].map((option) => option.value);

    // Two different blogs, not one "Blog" that means whichever is connected.
    expect(values).toContain('blog');
    expect(values).toContain('blogger');
  });

  it('offers the draft toggle only for Blogger, which is the only target with drafts', () => {
    TestBed.inject(MataroaSettings).connect('key', 'https://writer.mataroa.blog/');
    linkBlogger();
    const f = setUp();

    internals(f).onTargetChange('blog');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('.blog-draft')).toBeNull();

    internals(f).onTargetChange('blogger');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('.blog-draft')).not.toBeNull();
  });

  it('clears the draft flag when leaving a blog target, so it cannot leak into a toot', () => {
    linkBlogger();
    const f = setUp();
    internals(f).onTargetChange('blogger');
    internals(f).blogDraft.set(true);

    internals(f).onTargetChange('fedi');
    expect(internals(f).blogDraft()).toBe(false);
  });

  it('names the Mataroa blog target and requires a title', () => {
    TestBed.inject(MataroaSettings).connect('key', 'https://writer.mataroa.blog/');
    const f = setUp();
    const blogOption = [
      ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
        '.target-select option',
      ),
    ].find((option) => option.value === 'blog');

    // Named per service now that Blogger is a second, simultaneous blog target
    // — a generic "Blog" would not say which one a post is going to.
    expect(blogOption?.textContent).toContain('Mataroa');
    internals(f).onTargetChange('blog');
    internals(f).text.set('## A Markdown body');
    expect(internals(f).canSubmit()).toBe(false);

    internals(f).spoilerText.set('A title');
    expect(internals(f).canSubmit()).toBe(true);
    expect(internals(f).canAttachMedia()).toBe(false);
    expect(internals(f).canAddPoll()).toBe(false);
  });

  /** A connected Hugo repo, driven through real state like the others. */
  function linkHugo(): void {
    TestBed.inject(HugoSettings).connect('github_pat_secret', {
      owner: 'mistersql',
      repo: 'my-blog',
      branch: 'main',
      contentPath: 'content/posts',
      siteUrl: 'https://mistersql.github.io/my-blog/',
      includeInProfile: false,
    });
  }

  it('offers Hugo as a third simultaneous blog target, named for its repo', () => {
    TestBed.inject(MataroaSettings).connect('key', 'https://writer.mataroa.blog/');
    linkBlogger();
    linkHugo();
    const f = setUp();

    const options = [
      ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
        '.target-select option',
      ),
    ];
    expect(options.map((option) => option.value)).toEqual(
      expect.arrayContaining(['blog', 'blogger', 'hugo']),
    );
    // Named for the repo, so a user with three blogs can tell where a post goes.
    expect(options.find((option) => option.value === 'hugo')?.textContent).toContain(
      'mistersql/my-blog',
    );
  });

  it('applies every blog rule to Hugo without naming it anywhere', () => {
    linkHugo();
    const f = setUp();
    internals(f).onTargetChange('hugo');
    internals(f).text.set('## A Markdown body');

    // Title required, media and polls unavailable — all inherited from
    // isBlogTarget rather than restated per service.
    expect(internals(f).canSubmit()).toBe(false);
    internals(f).spoilerText.set('A title');
    expect(internals(f).canSubmit()).toBe(true);
    expect(internals(f).canAttachMedia()).toBe(false);
    expect(internals(f).canAddPoll()).toBe(false);
  });

  it('offers the draft toggle for Hugo, which has a native draft state', () => {
    linkHugo();
    const f = setUp();

    internals(f).onTargetChange('hugo');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('.blog-draft')).not.toBeNull();
  });

  it('does not offer Hugo when only the repo is stored and the token has gone', () => {
    // The state an imported-settings browser is in: coordinates, no credential.
    // The repo half alone cannot publish, so offering the target would be a
    // button whose only outcome is an error.
    localStorage.setItem(
      'mockingbird_hugo_repo',
      JSON.stringify({ owner: 'mistersql', repo: 'my-blog' }),
    );
    const f = setUp();

    expect(TestBed.inject(HugoSettings).repo()).not.toBeNull();
    const values = [
      ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
        '.target-select option',
      ),
    ].map((option) => option.value);
    expect(values).not.toContain('hugo');
  });

  /** The state the connector page leaves behind when you click "Edit". */
  function parkHugoEdit(over: Partial<HugoEdit> = {}): void {
    linkHugo();
    TestBed.inject(HugoEditSession).start({
      path: 'content/posts/hello-world.md',
      sha: 'blob-1',
      format: 'toml',
      date: '2020-03-04T05:06:07Z',
      extraLines: ['weight = 5'],
      originalTitle: 'Hello World',
      ...over,
    });
  }

  it('opens on the Hugo target when an edit is parked, not on Fedi', () => {
    parkHugoEdit();
    const f = setUp();

    // The user clicked Edit on a specific file; opening on Fedi would offer to
    // post their blog post as a toot.
    expect(internals(f).target()).toBe('hugo');
  });

  it('shows an unmistakable editing banner naming the file', () => {
    parkHugoEdit();
    const f = setUp();

    const banner = (f.nativeElement as HTMLElement).querySelector('.hugo-editing');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Hello World');
    expect(banner?.textContent).toContain('content/posts/hello-world.md');
  });

  it('labels the button Update post rather than Publish while editing', () => {
    parkHugoEdit();
    const f = setUp();
    internals(f).spoilerText.set('Hello World');
    internals(f).text.set('Revised.');
    f.detectChanges();

    const label = [
      ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.btn'),
    ]
      .map((b) => b.textContent?.trim())
      .find((t) => t === 'Update post' || t === 'Publish');
    expect(label).toBe('Update post');
  });

  it('abandons the edit when the target moves off Hugo', () => {
    parkHugoEdit();
    const f = setUp();

    internals(f).onTargetChange('fedi');

    // A parked path and sha that outlived the target would attach to whatever
    // the user writes next.
    expect(TestBed.inject(HugoEditSession).editing()).toBe(false);
  });

  it('abandons the edit when the user cancels, leaving the file alone', () => {
    parkHugoEdit();
    const f = setUp();

    internals(f).cancelHugoEdit();

    expect(TestBed.inject(HugoEditSession).editing()).toBe(false);
    expect(internals(f).text()).toBe('');
  });

  it('shows build status after publishing, and dismisses it on demand', () => {
    linkHugo();
    const f = setUp();
    const watch = TestBed.inject(HugoDeployWatch);
    watch.watch('commit-abc');
    f.detectChanges();

    const chip = (f.nativeElement as HTMLElement).querySelector('.hugo-deploy');
    expect(chip).not.toBeNull();
    // "Published" alone was the lie: the commit landed, the build has not run.
    expect(chip?.textContent).toContain('Committed');

    watch.stop();
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('.hugo-deploy')).toBeNull();
  });

  it('stops watching a build when the composer goes away', () => {
    linkHugo();
    const f = setUp();
    const watch = TestBed.inject(HugoDeployWatch);
    watch.watch('commit-abc');

    f.destroy();

    // A publish followed by navigating away must not leave a poller running.
    expect(watch.current()).toBeNull();
  });

  // ------------------------------------------------- paste visibility clamping
  //
  // Paste services only speak public/unlisted, so selecting Paste has to narrow
  // whatever the user picked. The bug these cover is that it used to be a
  // one-way trip: coming back to Fedi left the post silently downgraded to
  // unlisted, quietly overriding a deliberate choice.

  it('restores the pre-paste visibility when the target leaves paste', () => {
    const f = setUp();
    internals(f).onVisibilityChange('private');
    internals(f).onTargetChange('paste');
    expect(internals(f).visibility()).toBe('unlisted');

    internals(f).onTargetChange('fedi');
    expect(internals(f).visibility()).toBe('private');
  });

  it('restores what the user chose before ANY paste clamp, across providers', () => {
    const f = setUp();
    internals(f).onVisibilityChange('direct');
    internals(f).onTargetChange('paste');
    internals(f).onPasteProviderChange('rentry');
    internals(f).onPasteProviderChange('pastepile');

    internals(f).onTargetChange('fedi');
    expect(internals(f).visibility()).toBe('direct');
  });

  it('a hand-picked visibility on paste outranks the stashed one', () => {
    const f = setUp();
    internals(f).onVisibilityChange('private');
    internals(f).onTargetChange('paste');
    // The user deliberately chooses public while on Paste.
    internals(f).onVisibilityChange('public');

    internals(f).onTargetChange('fedi');
    expect(internals(f).visibility()).toBe('public');
  });

  it('falls back to the account posting default when nothing was stashed', () => {
    TestBed.inject(ClientPrefs).setDefaultVisibility('private');
    const f = setUp();
    // Straight to paste from the default public — a clamp happens, but then the
    // user picks by hand, dropping the stash.
    internals(f).onTargetChange('paste');
    internals(f).onVisibilityChange('unlisted');

    internals(f).onTargetChange('fedi');
    expect(internals(f).visibility()).toBe('private');
  });

  it('leaving burn expiry gives back the visibility burn narrowed', () => {
    const f = setUp();
    internals(f).onTargetChange('paste');
    internals(f).onPasteProviderChange('pastepile');
    internals(f).onVisibilityChange('public');

    internals(f).onPasteExpiryChange('burn');
    expect(internals(f).visibility()).toBe('unlisted');

    internals(f).onPasteExpiryChange('1w');
    expect(internals(f).visibility()).toBe('public');
  });

  it('a composer that never touches paste keeps its visibility', () => {
    const f = setUp();
    internals(f).onVisibilityChange('private');
    internals(f).onTargetChange('bsky');
    internals(f).onTargetChange('fedi');
    expect(internals(f).visibility()).toBe('private');
  });

  it('opens on the account posting default rather than assuming public', () => {
    TestBed.inject(ClientPrefs).setDefaultVisibility('unlisted');
    const f = setUp();
    expect(internals(f).visibility()).toBe('unlisted');
  });

  it('target=paste creates a Pastepile paste, stores its edit key, and emits a status', () => {
    const f = setUp();
    const posted: Status[] = [];
    f.componentInstance.posted.subscribe((status) => posted.push(status));
    internals(f).target.set('paste');
    internals(f).onPasteProviderChange('pastepile');
    internals(f).text.set('print("hello")');
    internals(f).cwOpen.set(true);
    internals(f).spoilerText.set('Example');
    internals(f).visibility.set('unlisted');
    internals(f).pasteLanguage.set('python');
    internals(f).pasteExpiry.set('10m');

    internals(f).submit();

    const req = httpMock.expectOne('https://www.pastepile.com/api/public/pastes');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      title: 'Example',
      content: 'print("hello")',
      language: 'python',
      expiry: '10m',
      visibility: 'unlisted',
    });
    req.flush({
      slug: 'abc123',
      url: 'https://pastepile.com/p/abc123',
      raw_url: 'https://pastepile.com/raw/abc123',
      edit_key: 'secret',
    });

    expect(posted[0].provider).toBe('paste');
    const stored = JSON.parse(localStorage.getItem('mockingbird_pastes') ?? '[]');
    expect(stored[0].editKey).toBeUndefined();
    expect(Object.values(storedEditKeys())).toContain('secret');
    expect(internals(f).text()).toBe('');
  });

  it('can publish an unlisted Rentry page and stores its edit code locally', () => {
    const f = setUp();
    internals(f).target.set('paste');
    internals(f).onPasteProviderChange('rentry');
    internals(f).text.set('A durable browser draft');
    internals(f).cwOpen.set(true);
    internals(f).spoilerText.set('Draft title');

    internals(f).submit();

    const request = httpMock.expectOne('https://rentry.co/api/new');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.get('text')).toBe('# Draft title\n\nA durable browser draft');
    request.flush({
      status: '200',
      url: 'https://rentry.co/browser-draft',
      edit_code: 'rentry-secret',
    });

    const stored = JSON.parse(localStorage.getItem('mockingbird_pastes') ?? '[]');
    expect(stored[0].providerId).toBe('rentry');
    expect(stored[0].editKey).toBeUndefined();
    expect(Object.values(storedEditKeys())).toContain('rentry-secret');
    expect(stored[0].expiry).toBe('never');
    expect(stored[0].visibility).toBe('unlisted');
  });

  it('keeps the user-picked paste provider when the seed effect re-runs (stale autosave)', () => {
    // Reproduces the bug where selecting Rentry still posted to the previously
    // autosaved Pastepile: the seed effect re-ran, reloaded the old autosave,
    // and clobbered the live pick. Seed a stale pastepile autosave first.
    TestBed.inject(Drafts).autosave('new', {
      segments: ['stale draft body'],
      spoilerText: '',
      sensitive: false,
      visibility: 'unlisted',
      poll: null,
      target: 'paste',
      pasteProviderId: 'pastepile',
      pasteLanguage: 'plaintext',
      pasteExpiry: '1w',
    });

    const f = setUp();
    // The stale autosave seeded pastepile…
    expect(internals(f).pasteProviderId()).toBe('pastepile');

    // …the user now picks Rentry…
    internals(f).target.set('paste');
    internals(f).onPasteProviderChange('rentry');
    internals(f).text.set('A durable browser draft');

    // …and something re-triggers the seed effect (a tracked input changes).
    f.componentRef.setInput('initialText', 'nudged');
    f.detectChanges();

    // The pick must survive — not revert to the stale pastepile.
    expect(internals(f).pasteProviderId()).toBe('rentry');

    internals(f).submit();
    const request = httpMock.expectOne('https://rentry.co/api/new');
    request.flush({ status: '200', url: 'https://rentry.co/ok', edit_code: 'k' });
    expect(JSON.parse(localStorage.getItem('mockingbird_pastes') ?? '[]')[0].providerId).toBe(
      'rentry',
    );
  });

  it('replacing with a translation relabels the post language', () => {
    const f = setUp();
    internals(f).text.set('Hello everyone');
    internals(f).postLanguage.set('en');

    f.componentInstance.useTranslation({ text: 'Saluton al ĉiuj', mode: 'replace', code: 'eo' });

    expect(internals(f).text()).toBe('Saluton al ĉiuj');
    // A post rewritten into Esperanto that still declares en is exactly the
    // mislabelling the feed filter is built to catch.
    expect(internals(f).postLanguage()).toBe('eo');
  });

  it('appending keeps both versions and leaves the language alone', () => {
    const f = setUp();
    internals(f).text.set('Hello everyone');
    internals(f).postLanguage.set('en');

    f.componentInstance.useTranslation({ text: 'Saluton al ĉiuj', mode: 'append', code: 'eo' });

    expect(internals(f).text()).toBe('Hello everyone\n\nSaluton al ĉiuj');
    // A bilingual post has no single language, so guessing one would be worse
    // than leaving the user's choice.
    expect(internals(f).postLanguage()).toBe('en');
  });

  it('Anonymous defaults to Paste and cannot reach the Mastodon-backed destinations', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const f = setUp();

    expect(internals(f).target()).toBe('paste');
    const options = [...(f.nativeElement as HTMLElement).querySelectorAll('.target-select option')];
    // Fedi needs a token; with no Bluesky link there is nothing else to offer.
    expect(options.some((option) => option.getAttribute('value') === 'fedi')).toBe(false);
    expect(options.some((option) => option.getAttribute('value') === 'bsky')).toBe(false);
    expect(options.some((option) => option.getAttribute('value') === 'paste')).toBe(true);
  });

  it('Anonymous can post to a linked Bluesky, but not to Fedi or Both', () => {
    // Bluesky carries its own credential, so it works without a Mastodon
    // account — the point of the connector for Bluesky-first readers. "Both"
    // still includes a Fedi post, so it stays out.
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    linkBsky();
    const f = setUp();

    const values = [...(f.nativeElement as HTMLElement).querySelectorAll('.target-select option')]
      .map((option) => option.getAttribute('value'))
      .filter((value): value is string => value !== null);
    expect(values).toContain('bsky');
    expect(values).not.toContain('fedi');
    expect(values).not.toContain('both');
  });

  it('target=bsky posts a record to Bluesky only and emits a local status', () => {
    linkBsky();
    const f = setUp();
    const posted: Status[] = [];
    f.componentInstance.posted.subscribe((s: Status) => posted.push(s));

    internals(f).target.set('bsky');
    internals(f).text.set('hello butterfly');
    internals(f).submit();

    httpMock.expectNone('/api/v1/statuses');
    const req = httpMock.expectOne(CREATE_RECORD);
    expect(req.request.body.collection).toBe('app.bsky.feed.post');
    expect(req.request.body.record.text).toBe('hello butterfly');
    req.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/xyz', cid: 'cid1' });

    expect(posted).toHaveLength(1);
    expect(posted[0].provider).toBe('bluesky');
    expect(posted[0].id).toBe('bsky:at://did:plc:me/app.bsky.feed.post/xyz');
    expect(internals(f).text()).toBe('');
  });

  it('target=both posts to Fedi and Bluesky, emitting the Fedi status', () => {
    linkBsky();
    const f = setUp();
    const posted: Status[] = [];
    f.componentInstance.posted.subscribe((s: Status) => posted.push(s));

    internals(f).target.set('both');
    internals(f).text.set('everywhere at once');
    internals(f).submit();

    const bsky = httpMock.expectOne(CREATE_RECORD);
    bsky.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/abc', cid: 'cid2' });
    const fedi = httpMock.expectOne('/api/v1/statuses');
    expect(fedi.request.body.status).toBe('everywhere at once');
    fedi.flush({ id: 'm1' });

    expect(posted).toHaveLength(1);
    expect(posted[0].id).toBe('m1');
  });

  it('requires public visibility for Bluesky and Both without widening a private draft', () => {
    linkBsky();
    const f = setUp();
    internals(f).text.set('restricted writing');
    for (const target of ['bsky', 'both'] as const) {
      for (const visibility of ['private', 'direct', 'unlisted']) {
        internals(f).onVisibilityChange(visibility);
        internals(f).onTargetChange(target);
        f.detectChanges();
        expect(internals(f).visibility()).toBe(visibility);
        expect(internals(f).canSubmit()).toBe(false);
        expect((f.nativeElement as HTMLElement).textContent).toContain('Bluesky posts are public');
        internals(f).submit();
        httpMock.expectNone(CREATE_RECORD);
        httpMock.expectNone('/api/v1/statuses');
      }
    }
    internals(f).onVisibilityChange('public');
    expect(internals(f).canSubmit()).toBe(true);
    internals(f).onTargetChange('fedi');
    internals(f).onVisibilityChange('private');
    expect(internals(f).canSubmit()).toBe(true);
  });

  it('rechecks the Bluesky audience when an undo-send countdown finishes', () => {
    vi.useFakeTimers();
    linkBsky();
    TestBed.inject(ClientPrefs).setDelayedSend(true);
    const f = setUp();
    internals(f).onTargetChange('both');
    internals(f).text.set('pending post');
    internals(f).submit();
    expect(internals(f).countdown()).toBe(30);
    internals(f).onVisibilityChange('private');
    vi.advanceTimersByTime(30_000);
    httpMock.expectNone(CREATE_RECORD);
    httpMock.expectNone('/api/v1/statuses');
    expect(internals(f).text()).toBe('pending post');
  });

  it('a failed Bluesky leg on "both" retains the Fedi result for a Bluesky-only retry', () => {
    linkBsky();
    const f = setUp();
    const posted: Status[] = [];
    f.componentInstance.posted.subscribe((s: Status) => posted.push(s));

    internals(f).target.set('both');
    internals(f).text.set('half delivered');
    internals(f).submit();

    const failedBsky = httpMock.expectOne(CREATE_RECORD);
    const bskyRkey = failedBsky.request.body.rkey;
    failedBsky.flush({ error: 'boom' }, { status: 500, statusText: 'ISE' });
    httpMock.expectOne('/api/v1/statuses').flush({ id: 'm2' });

    expect(posted).toEqual([]);
    expect(internals(f).text()).toBe('half delivered');
    expect(internals(f).crossPostError()).toContain('Bluesky');

    internals(f).submit();
    httpMock.expectNone('/api/v1/statuses');
    const retriedBsky = httpMock.expectOne(CREATE_RECORD);
    expect(retriedBsky.request.body.rkey).toBe(bskyRkey);
    retriedBsky.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/retry', cid: 'cid-retry' });

    expect(posted.map((s) => s.id)).toEqual(['m2']);
    expect(internals(f).text()).toBe('');
  });

  it('reuses a Mastodon key after a committed write loses its response, but not after an edit', () => {
    const f = setUp();
    internals(f).text.set('send exactly once');
    internals(f).submit();

    const lost = httpMock.expectOne('/api/v1/statuses');
    const firstKey = lost.request.headers.get('Idempotency-Key');
    expect(firstKey).toBeTruthy();
    lost.flush(null, { status: 0, statusText: 'Unknown Error' });

    internals(f).submit();
    const retry = httpMock.expectOne('/api/v1/statuses');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(firstKey);
    retry.flush(null, { status: 0, statusText: 'Unknown Error' });

    internals(f).text.set('edited before retry');
    internals(f).submit();
    const edited = httpMock.expectOne('/api/v1/statuses');
    expect(edited.request.headers.get('Idempotency-Key')).not.toBe(firstKey);
    edited.flush({ id: 'edited-1' });
  });

  it('resumes a Fedi thread at the failed segment with its original key and parent', () => {
    const f = setUp();
    internals(f).text.set('one');
    internals(f).addThreadBox();
    internals(f).setThreadText(0, 'two');
    internals(f).addThreadBox();
    internals(f).setThreadText(1, 'three');
    internals(f).submit();

    const root = httpMock.expectOne('/api/v1/statuses');
    const rootKey = root.request.headers.get('Idempotency-Key');
    root.flush({ id: 'm1' });
    const halfway = httpMock.expectOne('/api/v1/statuses');
    const halfwayKey = halfway.request.headers.get('Idempotency-Key');
    expect(halfwayKey).not.toBe(rootKey);
    halfway.flush({ error: 'temporary' }, { status: 503, statusText: 'Unavailable' });

    expect(internals(f).postError()?.message).toContain('retry will skip');
    internals(f).submit();
    const resumed = httpMock.expectOne('/api/v1/statuses');
    expect(resumed.request.body).toMatchObject({ status: 'two', in_reply_to_id: 'm1' });
    expect(resumed.request.headers.get('Idempotency-Key')).toBe(halfwayKey);
    resumed.flush({ id: 'm2' });
    const tail = httpMock.expectOne('/api/v1/statuses');
    expect(tail.request.body).toMatchObject({ status: 'three', in_reply_to_id: 'm2' });
    expect(tail.request.headers.get('Idempotency-Key')).not.toBe(halfwayKey);
    tail.flush({ id: 'm3' });
  });

  it('retains the Bluesky root when an unfinished thread segment is edited', () => {
    linkBsky();
    const f = setUp();
    const c = internals(f);
    c.target.set('bsky');
    c.text.set('one');
    c.addThreadBox();
    c.setThreadText(0, 'two');
    c.submit();
    httpMock.expectOne(CREATE_RECORD).flush({ uri: 'at://root', cid: 'root' });
    const failed = httpMock.expectOne(CREATE_RECORD);
    const key = failed.request.body.rkey;
    failed.flush({ error: 'InvalidRequest' }, { status: 400, statusText: 'Bad Request' });
    c.setThreadText(0, 'shorter two');
    c.submit();
    const resumed = httpMock.expectOne(CREATE_RECORD);
    expect(resumed.request.body.rkey).toBe(key);
    expect(resumed.request.body.record.text).toBe('shorter two');
    expect(resumed.request.body.record.reply.parent).toEqual({ uri: 'at://root', cid: 'root' });
    resumed.flush({ uri: 'at://second', cid: 'second' });
  });

  it('skips a completed Bluesky leg when Fedi fails, regardless of response ordering', () => {
    linkBsky();
    const f = setUp();
    const posted: Status[] = [];
    f.componentInstance.posted.subscribe((status: Status) => posted.push(status));
    internals(f).target.set('both');
    internals(f).text.set('bsky landed first');
    internals(f).submit();

    httpMock
      .expectOne(CREATE_RECORD)
      .flush({ uri: 'at://did:plc:me/app.bsky.feed.post/first', cid: 'b1' });
    httpMock
      .expectOne('/api/v1/statuses')
      .flush({ error: 'temporary' }, { status: 503, statusText: 'Unavailable' });
    expect(posted).toEqual([]);
    expect(internals(f).postError()?.message).toContain('Bluesky copy was already published');

    internals(f).submit();
    httpMock.expectNone(CREATE_RECORD);
    httpMock.expectOne('/api/v1/statuses').flush({ id: 'm-after-bsky' });
    expect(posted.map((status) => status.id)).toEqual(['m-after-bsky']);
  });

  it('waits for Mastodon media descriptions before starting either "both" destination', () => {
    linkBsky();
    const f = setUp();
    internals(f).target.set('both');
    internals(f).text.set('described everywhere');
    internals(f).media.set([{ media: { id: 'media-1' }, description: 'A fox crossing the snow' }]);
    internals(f).submit();

    const metadata = httpMock.expectOne('/api/v1/media/media-1');
    httpMock.expectNone(CREATE_RECORD);
    httpMock.expectNone('/api/v1/statuses');

    metadata.flush({ id: 'media-1' });
    httpMock
      .expectOne(CREATE_RECORD)
      .flush({ uri: 'at://did:plc:me/app.bsky.feed.post/abc', cid: 'cid1' });
    httpMock.expectOne('/api/v1/statuses').flush({ id: 'm1' });
  });

  it('blocks submit when a Bluesky-bound post exceeds 300 graphemes', () => {
    linkBsky();
    const f = setUp();
    internals(f).target.set('both');
    internals(f).text.set('x'.repeat(301));
    expect(internals(f).canSubmit()).toBe(false);
    internals(f).target.set('fedi');
    expect(internals(f).canSubmit()).toBe(true);
  });

  it('measures thread boxes against the Bluesky limit, not the Fedi one', () => {
    // 400 characters is fine on Fedi and over on Bluesky. The composer used to
    // measure every box against 500 whatever the target, so this was invisible
    // until the network refused it.
    linkBsky();
    const f = setUp();
    internals(f).target.set('bsky');
    internals(f).text.set('root post');
    internals(f).addThreadBox();
    internals(f).setThreadText(0, 'x'.repeat(400));
    expect(internals(f).overLimit()).toBe(true);

    internals(f).target.set('fedi');
    expect(internals(f).overLimit()).toBe(false);
  });

  it('posts a Bluesky thread as a chain of replies', () => {
    linkBsky();
    const f = setUp();
    internals(f).target.set('bsky');
    internals(f).text.set('first');
    internals(f).addThreadBox();
    internals(f).setThreadText(0, 'second');

    // The whole point: a filled second box no longer kills the button.
    expect(internals(f).canSubmit()).toBe(true);
    internals(f).submit();

    const root = httpMock.expectOne(CREATE_RECORD);
    expect(root.request.body.record.text).toBe('first');
    expect(root.request.body.record.reply).toBeUndefined();
    root.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/one', cid: 'cid1' });

    const reply = httpMock.expectOne(CREATE_RECORD);
    expect(reply.request.body.record.text).toBe('second');
    // Bluesky wants both refs; for a two-post thread the root *is* the parent.
    expect(reply.request.body.record.reply).toEqual({
      root: { uri: 'at://did:plc:me/app.bsky.feed.post/one', cid: 'cid1' },
      parent: { uri: 'at://did:plc:me/app.bsky.feed.post/one', cid: 'cid1' },
    });
    reply.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/two', cid: 'cid2' });
  });

  it('a thread that fails midway says how much of it went out', () => {
    linkBsky();
    const f = setUp();
    internals(f).target.set('bsky');
    internals(f).text.set('first');
    internals(f).addThreadBox();
    internals(f).setThreadText(0, 'second');
    internals(f).submit();

    const root = httpMock.expectOne(CREATE_RECORD);
    const rootRkey = root.request.body.rkey;
    root.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/one', cid: 'cid1' });
    const failedReply = httpMock.expectOne(CREATE_RECORD);
    const replyRkey = failedReply.request.body.rkey;
    expect(replyRkey).not.toBe(rootRkey);
    failedReply.flush('nope', { status: 500, statusText: 'Server Error' });

    // Re-sending would duplicate the post that landed, so the message has to
    // say what happened rather than offering a plain retry.
    expect(internals(f).crossPostError()).toContain('first post');

    internals(f).submit();
    const resumed = httpMock.expectOne(CREATE_RECORD);
    expect(resumed.request.body.rkey).toBe(replyRkey);
    expect(resumed.request.body.record.reply).toEqual({
      root: { uri: 'at://did:plc:me/app.bsky.feed.post/one', cid: 'cid1' },
      parent: { uri: 'at://did:plc:me/app.bsky.feed.post/one', cid: 'cid1' },
    });
    resumed.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/two', cid: 'cid2' });
  });

  /**
   * Images to Bluesky.
   *
   * This used to be "blocks a bsky-only post that has media attached", which
   * described the bug rather than a rule: `canAttachMedia` never consulted the
   * target, so the 📎 was live and a file could be picked — and then `canSubmit`
   * returned false and the post button silently went dead. The only explanation
   * was a muted hint elsewhere on screen. The reader's report was "I can't
   * attach an image", and they were right.
   */
  it('allows a bsky-only post with an image attached', () => {
    linkBsky();
    const f = setUp();
    internals(f).target.set('bsky');
    internals(f).text.set('with a picture');
    internals(f).media.set([
      {
        media: { id: 'm1' },
        description: '',
        file: new File([''], 'a.png', { type: 'image/png' }),
      },
    ]);

    expect(internals(f).canSubmit()).toBe(true);
  });

  describe('posting images to Bluesky', () => {
    const UPLOAD_BLOB = 'https://bsky.social/xrpc/com.atproto.repo.uploadBlob';

    /** A blob ref shaped the way uploadBlob really answers. */
    const blobRef = (link: string) => ({
      blob: { $type: 'blob', ref: { $link: link }, mimeType: 'image/jpeg', size: 1000 },
    });

    beforeEach(() => {
      // The downscaler is covered on its own in bluesky-image.spec.ts; here it
      // is stubbed so these tests are about the posting flow.
      vi.stubGlobal('createImageBitmap', () =>
        Promise.resolve({ width: 800, height: 600, close: vi.fn() }),
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    function attach(f: ComponentFixture<Compose>, name = 'a.jpg', description = ''): void {
      internals(f).media.update((list) => [
        ...list,
        {
          media: { id: `local:${name}` },
          description,
          // Small enough that prepareImageForBluesky passes it straight through.
          file: new File(['x'], name, { type: 'image/jpeg' }),
        },
      ]);
    }

    it('uploads the blob, then posts a record embedding it', async () => {
      linkBsky();
      const f = setUp();
      internals(f).target.set('bsky');
      internals(f).text.set('look at this');
      attach(f);

      internals(f).submit();
      // The upload has to finish before the record exists, so let the promise
      // chain settle before the request is expected.
      await new Promise((r) => setTimeout(r, 0));

      const upload = httpMock.expectOne(UPLOAD_BLOB);
      expect(upload.request.headers.get('Content-Type')).toBe('image/jpeg');
      upload.flush(blobRef('bafy-1'));
      await new Promise((r) => setTimeout(r, 0));

      const post = httpMock.expectOne(CREATE_RECORD);
      const embed = post.request.body.record.embed;
      expect(embed.$type).toBe('app.bsky.embed.images');
      expect(embed.images).toHaveLength(1);
      expect(embed.images[0].image.ref.$link).toBe('bafy-1');
      post.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/1', cid: 'cid1' });
    });

    it('carries the alt text through to the embed', async () => {
      // Bluesky's lexicon requires the key, and an image with no description is
      // a real accessibility loss — the composer already collects one.
      linkBsky();
      const f = setUp();
      internals(f).target.set('bsky');
      internals(f).text.set('with alt');
      attach(f, 'a.jpg', 'a tabby asleep on a keyboard');

      internals(f).submit();
      await new Promise((r) => setTimeout(r, 0));
      httpMock.expectOne(UPLOAD_BLOB).flush(blobRef('bafy-1'));
      await new Promise((r) => setTimeout(r, 0));

      const post = httpMock.expectOne(CREATE_RECORD);
      expect(post.request.body.record.embed.images[0].alt).toBe('a tabby asleep on a keyboard');
      post.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/1', cid: 'cid1' });
    });

    it('posts nothing when an upload fails', async () => {
      // A post that silently dropped one of the photos would leave the reader to
      // notice the omission themselves, after publishing.
      linkBsky();
      const f = setUp();
      internals(f).target.set('bsky');
      internals(f).text.set('should not post');
      attach(f);

      internals(f).submit();
      await new Promise((r) => setTimeout(r, 0));
      httpMock.expectOne(UPLOAD_BLOB).flush('no', { status: 500, statusText: 'Server Error' });
      await new Promise((r) => setTimeout(r, 0));

      httpMock.expectNone(CREATE_RECORD);
      expect(internals(f).crossPostError()).toContain('nothing was posted');
    });

    it('attaches images to the first post of a thread only', async () => {
      // The attachments belong to the post being written; repeating them down
      // the chain would publish the same photos several times.
      linkBsky();
      const f = setUp();
      internals(f).target.set('bsky');
      internals(f).text.set('first');
      internals(f).thread.set(['second']);
      attach(f);

      internals(f).submit();
      await new Promise((r) => setTimeout(r, 0));
      httpMock.expectOne(UPLOAD_BLOB).flush(blobRef('bafy-1'));
      await new Promise((r) => setTimeout(r, 0));

      const first = httpMock.expectOne(CREATE_RECORD);
      expect(first.request.body.record.embed).toBeDefined();
      first.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/1', cid: 'cid1' });

      const second = httpMock.expectOne(CREATE_RECORD);
      expect(second.request.body.record.embed).toBeUndefined();
      second.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/2', cid: 'cid2' });
    });

    it('does not upload to Mastodon for a Bluesky-only post', () => {
      // There is no Mastodon post to attach it to, so uploading there would
      // spend a call and store a file nothing will ever reference.
      linkBsky();
      const f = setUp();
      internals(f).target.set('bsky');

      internals(f).uploadFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);

      httpMock.expectNone('/api/v1/media');
      expect(internals(f).media()).toHaveLength(1);
      expect(internals(f).media()[0].file).toBeDefined();
    });

    it('leaves video out and says so, rather than failing at submit', () => {
      linkBsky();
      const f = setUp();
      internals(f).target.set('bsky');

      internals(f).uploadFiles([new File(['x'], 'clip.mp4', { type: 'video/mp4' })]);

      expect(internals(f).media()).toHaveLength(0);
      expect(internals(f).mediaNotice()).toContain('images only');
    });

    it('caps at four images and says how many were left out', () => {
      linkBsky();
      const f = setUp();
      internals(f).target.set('bsky');

      internals(f).uploadFiles(
        Array.from({ length: 6 }, (_, i) => new File(['x'], `${i}.jpg`, { type: 'image/jpeg' })),
      );

      expect(internals(f).media()).toHaveLength(4);
      expect(internals(f).mediaNotice()).toContain('2 were left out');
    });
  });

  it('still blocks a bsky-only post with a poll, which the protocol has no record for', () => {
    // The one thing a Bluesky leg genuinely cannot carry. Kept as the contrast:
    // media was lumped in with this and should not have been.
    linkBsky();
    const f = setUp();
    internals(f).target.set('bsky');
    internals(f).text.set('pick one');
    internals(f).pollOpen.set(true);

    expect(internals(f).canSubmit()).toBe(false);
  });

  // --------------------------------------------------- language-mismatch banner

  /** English text that detects confidently as `en` (rich in stop-words). */
  const ENGLISH_BODY = 'the cat is on the table and the dog is here with them';

  it('raises the language-mismatch banner when picked language disagrees with text', () => {
    const f = setUp();
    internals(f).text.set(ENGLISH_BODY);
    internals(f).onLanguageChange('de'); // picked German, text is English
    internals(f).submit();
    expect(internals(f).langMismatch()).toEqual({ picked: 'de', detected: 'en' });
  });

  it('"Keep editing" dismisses the banner and does not re-raise on next submit', () => {
    const f = setUp();
    internals(f).text.set(ENGLISH_BODY);
    internals(f).onLanguageChange('de');
    internals(f).submit();
    expect(internals(f).langMismatch()).not.toBeNull();

    internals(f).dismissLangMismatch();
    expect(internals(f).langMismatch()).toBeNull();

    // The exact same mismatch must not pop straight back up: the next submit
    // proceeds to actually post (as the picked language) instead of re-warning.
    internals(f).submit();
    expect(internals(f).langMismatch()).toBeNull();
    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.body.language).toBe('de');
    req.flush({ id: '1' });
  });

  it('re-arms the warning after a dismissal once the picked language changes', () => {
    const f = setUp();
    internals(f).text.set(ENGLISH_BODY);
    internals(f).onLanguageChange('de');
    internals(f).submit();
    internals(f).dismissLangMismatch();

    // Pick a different (still-wrong) language: the dismissal no longer applies.
    internals(f).onLanguageChange('fr');
    internals(f).submit();
    expect(internals(f).langMismatch()).toEqual({ picked: 'fr', detected: 'en' });
  });

  // ------------------------------------------------------- reply mention seeding

  it('previews user content but never the automatic reply mention alone', () => {
    const f = setUp();
    f.componentRef.setInput('inReplyToId', 's1');
    f.componentRef.setInput('replyToHandle', 'alice@dmv.community');
    f.detectChanges();
    expect(internals(f).previewVisible()).toBe(false);

    internals(f).text.update((text) => text + 'H');
    expect(internals(f).previewVisible()).toBe(true);
    internals(f).text.set('@alice@dmv.community ');
    expect(internals(f).previewVisible()).toBe(false);
    internals(f).text.set('');
    expect(internals(f).previewVisible()).toBe(false);
    internals(f).text.set('H');
    expect(internals(f).previewVisible()).toBe(true);
  });

  it('does not preview an initial group of reply mentions', () => {
    const f = setUp();
    f.componentRef.setInput('inReplyToId', 's1');
    f.componentRef.setInput('initialText', '@alice@dmv.community @bob@example.com ');
    f.detectChanges();
    expect(internals(f).previewVisible()).toBe(false);
    internals(f).text.update((text) => text + 'Hello');
    expect(internals(f).previewVisible()).toBe(true);
  });

  it('seeds the parent author @handle for a reply so it notifies them', () => {
    const f = setUp();
    f.componentRef.setInput('inReplyToId', 's1');
    f.componentRef.setInput('replyToHandle', 'alice@dmv.community');
    f.detectChanges();

    expect(internals(f).text()).toBe('@alice@dmv.community ');
    expect(internals(f).showReplyMentionHint()).toBe(true);
  });

  it('drops the mention hint once the seeded @handle is removed', () => {
    const f = setUp();
    f.componentRef.setInput('inReplyToId', 's1');
    f.componentRef.setInput('replyToHandle', 'alice@dmv.community');
    f.detectChanges();
    expect(internals(f).showReplyMentionHint()).toBe(true);

    // User deletes the handle to reply silently: hint disappears.
    internals(f).text.set('just a quiet thread reply');
    expect(internals(f).showReplyMentionHint()).toBe(false);
  });

  it('does not seed your own handle when replying to yourself', () => {
    TestBed.inject(Auth).account.set({ id: '1', acct: 'me@dmv.community' } as never);
    const f = setUp();
    f.componentRef.setInput('inReplyToId', 's1');
    f.componentRef.setInput('replyToHandle', 'me@dmv.community');
    f.detectChanges();

    expect(internals(f).text()).toBe('');
    expect(internals(f).showReplyMentionHint()).toBe(false);
  });

  it('never shows the mention hint outside a reply (top-level compose)', () => {
    const f = setUp();
    internals(f).text.set('@someone hello');
    // No inReplyToId → not a reply → no hint even if text leads with a mention.
    expect(internals(f).showReplyMentionHint()).toBe(false);
  });

  it('lets an explicit initialText override the auto-seeded reply handle', () => {
    const f = setUp();
    f.componentRef.setInput('inReplyToId', 's1');
    f.componentRef.setInput('replyToHandle', 'alice@dmv.community');
    f.componentRef.setInput('initialText', '@alice@dmv.community @bob@x.social ');
    f.detectChanges();

    // The caller's multi-mention seed wins (e.g. group chat), not the single handle.
    expect(internals(f).text()).toBe('@alice@dmv.community @bob@x.social ');
    expect(internals(f).showReplyMentionHint()).toBe(true);
  });

  // ------------------------------------------------- "Edit for post" handoff
  //
  // The one destructive path in the whole drafts feature. The ordering is the
  // point: publish first, offer to delete second. Delete-then-publish is what
  // the mastodon.social folk recipe does, and it is how people lose posts.

  it('seeds from a pending handoff and offers cleanup only after publishing', () => {
    const drafts = TestBed.inject(Drafts);
    drafts.handoff(
      {
        segments: ['promoted from a private note'],
        spoilerText: '',
        sensitive: false,
        visibility: 'public',
        poll: null,
      },
      'self-99',
    );

    const f = setUp();
    expect(internals(f).text()).toBe('promoted from a private note');
    // Nothing offered yet — the post hasn't happened.
    expect(internals(f).pendingSelfCleanup()).toBeNull();

    internals(f).submit();
    httpMock.expectOne('/api/v1/statuses').flush({ id: 'new-1' });

    expect(internals(f).pendingSelfCleanup()).toBe('self-99');
  });

  it('immediately publishes a handoff already reviewed by the writing wizard', () => {
    vi.useFakeTimers();
    TestBed.inject(Drafts).handoff(
      {
        segments: ['reviewed and ready'],
        spoilerText: 'A warning',
        sensitive: true,
        visibility: 'unlisted',
        poll: null,
        postLanguage: 'eo',
        target: 'fedi',
      },
      undefined,
      { publishImmediately: true },
    );

    const f = setUp();
    vi.advanceTimersByTime(0);
    const request = httpMock.expectOne('/api/v1/statuses');
    expect(request.request.body).toMatchObject({
      status: 'reviewed and ready',
      spoiler_text: 'A warning',
      sensitive: true,
      visibility: 'unlisted',
      language: 'eo',
    });
    request.flush({ id: 'new-1' });
    expect(internals(f).text()).toBe('');
  });

  it('never offers cleanup when the publish fails', () => {
    const drafts = TestBed.inject(Drafts);
    drafts.handoff(
      {
        segments: ['this will not post'],
        spoilerText: '',
        sensitive: false,
        visibility: 'public',
        poll: null,
      },
      'self-99',
    );
    const f = setUp();

    internals(f).submit();
    httpMock.expectOne('/api/v1/statuses').error(new ProgressEvent('500'));

    // The private copy is still the only copy — it must survive.
    expect(internals(f).pendingSelfCleanup()).toBeNull();
  });

  it('deletes the private copy on confirm', () => {
    const f = setUp();
    internals(f).pendingSelfCleanup.set('self-99');

    internals(f).deleteSelfDraftCopy();

    httpMock.expectOne({ url: '/api/v1/statuses/self-99', method: 'DELETE' }).flush({});
    expect(internals(f).pendingSelfCleanup()).toBeNull();
  });

  it('reports a failed cleanup rather than pretending the copy is gone', () => {
    const f = setUp();
    internals(f).pendingSelfCleanup.set('self-99');

    internals(f).deleteSelfDraftCopy();
    httpMock
      .expectOne({ url: '/api/v1/statuses/self-99', method: 'DELETE' })
      .error(new ProgressEvent('500'));

    expect(internals(f).selfCleanupError()).toContain('still in your messages');
  });

  it('a handoff seeds exactly once and does not survive into the next composer', () => {
    const drafts = TestBed.inject(Drafts);
    drafts.handoff({
      segments: ['one shot'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });

    expect(internals(setUp()).text()).toBe('one shot');
    // Drained: a second composer starts empty rather than re-seeding.
    expect(drafts.takeHandoff()).toBeNull();
  });

  // -------------------------------------------------------- thoughtful posting
  //
  // The gate's whole value is that it cannot be walked around. These assert the
  // *absence* of a network call, which is the only thing that really proves it.

  it('a gated composer saves a draft instead of posting', () => {
    TestBed.inject(ClientPrefs).setThoughtfulPosting(true);
    const drafts = TestBed.inject(Drafts);
    const f = TestBed.createComponent(Compose);
    f.componentRef.setInput('gateable', true);
    f.detectChanges();

    internals(f).text.set('a thought worth sitting on');
    internals(f).submit();

    // Nothing was published — httpMock.verify() in afterEach enforces it.
    expect(drafts.drafts()).toHaveLength(1);
    expect(drafts.drafts()[0].segments[0]).toBe('a thought worth sitting on');
    expect(internals(f).text()).toBe('');
  });

  it('keeps the editor and reports unsaved when an explicit draft write fails', () => {
    const f = setUp();
    internals(f).text.set('the only copy');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    internals(f).saveDraft();
    f.detectChanges();

    expect(internals(f).text()).toBe('the only copy');
    expect(internals(f).draftSaved()).toBe(false);
    expect(internals(f).draftSaveFailed()).toBe(true);
    expect(f.nativeElement.textContent).toContain('could not be saved');
    expect(TestBed.inject(Drafts).drafts()).toEqual([]);
  });

  it('reports a failed autosave without clearing the editor', () => {
    vi.useFakeTimers();
    const f = setUp();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    internals(f).text.set('autosave must keep this');
    f.detectChanges();
    vi.advanceTimersByTime(500);
    f.detectChanges();

    expect(internals(f).text()).toBe('autosave must keep this');
    expect(internals(f).draftSaveFailed()).toBe(true);
    expect(f.nativeElement.textContent).toContain('could not be saved');
  });

  it('downloads the live editor as JSON without using localStorage', () => {
    const f = setUp();
    internals(f).text.set('portable copy');
    const downloads: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this);
    });

    internals(f).downloadDraft();

    expect(downloads[0].download).toMatch(/^mockingbird-draft-/);
    expect(decodeURIComponent(downloads[0].href)).toContain('portable copy');
  });

  it('an opted-in composer still posts normally while the pref is off', () => {
    const f = TestBed.createComponent(Compose);
    f.componentRef.setInput('gateable', true);
    f.detectChanges();

    internals(f).text.set('ordinary post');
    internals(f).submit();

    httpMock.expectOne('/api/v1/statuses').flush({ id: '1' });
    expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);
  });

  // Replies are urgent; mellowing them in a queue destroys what they're for.
  // A mount that never opts in must be untouched even with the pref on.
  it('a reply is never gated, even with thoughtful posting on', () => {
    TestBed.inject(ClientPrefs).setThoughtfulPosting(true);
    const f = TestBed.createComponent(Compose);
    f.componentRef.setInput('inReplyToId', 'parent-1');
    f.detectChanges();

    internals(f).text.set('urgent reply');
    internals(f).submit();

    httpMock.expectOne('/api/v1/statuses').flush({ id: '2' });
    expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);
  });

  it('a non-opted-in top-level composer (paste share, chat) is not gated', () => {
    TestBed.inject(ClientPrefs).setThoughtfulPosting(true);
    const f = setUp();

    internals(f).text.set('sharing a paste link');
    internals(f).submit();

    httpMock.expectOne('/api/v1/statuses').flush({ id: '3' });
    expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);
  });

  it('a reply composer never swallows a top-level handoff', () => {
    const drafts = TestBed.inject(Drafts);
    drafts.handoff({
      segments: ['meant for the main box'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });

    const f = TestBed.createComponent(Compose);
    f.componentRef.setInput('inReplyToId', 'parent-1');
    f.detectChanges();

    expect(internals(f).text()).not.toContain('meant for the main box');
    expect(drafts.takeHandoff()).not.toBeNull();
  });
});

describe('describePostFailure', () => {
  // The bug this guards: every post-failure handler threw the error away, so a
  // server that said exactly why it refused (too long, contains a link,
  // moderated) produced a silent no-op and the user retried forever.
  it('surfaces the server-supplied reason', () => {
    const err = new HttpErrorResponse({
      status: 422,
      error: { error: "Links aren't allowed in posts.", code: 'url_not_allowed' },
    });
    expect(describePostFailure(err).message).toBe("Links aren't allowed in posts.");
  });

  it('parses a JSON body that arrived as a string', () => {
    // Angular leaves the body unparsed when the error response's content type
    // isn't JSON, which real servers get wrong often enough to matter.
    const err = new HttpErrorResponse({
      status: 422,
      error: '{"error":"Too long","code":"unprocessable"}',
    });
    expect(describePostFailure(err).message).toBe('Too long');
  });

  it('prefers error_description when a server sends both', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: { error: 'invalid_request', error_description: 'Status is over the limit.' },
    });
    expect(describePostFailure(err).message).toBe('Status is over the limit.');
  });

  it('explains an opaque CORS/network failure rather than blaming the post', () => {
    expect(describePostFailure(new HttpErrorResponse({ status: 0 })).message).toContain(
      "Couldn't reach the server",
    );
  });

  it('points a rejected token at reauthentication', () => {
    expect(describePostFailure(new HttpErrorResponse({ status: 401 })).message).toContain(
      'reauthenticate',
    );
  });

  it('falls back to the status code when the body is unusable', () => {
    const err = new HttpErrorResponse({ status: 503, error: '<html>gateway</html>' });
    expect(describePostFailure(err).message).toContain('503');
  });

  // Server-side validation evolves. A client that only understands the codes it
  // was written against gets steadily less useful as new rules appear, so every
  // unrecognized field is surfaced rather than dropped.
  it('surfaces fields it has never seen as labelled detail rows', () => {
    const err = new HttpErrorResponse({
      status: 422,
      error: {
        error: 'That word is not in the dictionary.',
        code: 'word_not_recognized',
        rejected_word: 'speedbomber21',
        suggestion: 'Describe the behaviour instead of naming the person.',
      },
    });

    const failure = describePostFailure(err);
    expect(failure.message).toBe('That word is not in the dictionary.');
    const labels = failure.details.map((d) => d.label);
    expect(labels).toContain('Rejected word');
    expect(labels).toContain('Suggestion');
    expect(failure.details.find((d) => d.label === 'Rejected word')?.value).toBe('speedbomber21');
  });

  it('renders an array value as a readable list', () => {
    const err = new HttpErrorResponse({
      status: 422,
      error: { error: 'Some words were rejected.', unknown_words: ['asdf', 'qwerty'] },
    });
    expect(describePostFailure(err).details[0].value).toBe('asdf, qwerty');
  });

  it('flattens a nested object rather than printing [object Object]', () => {
    const err = new HttpErrorResponse({
      status: 429,
      error: { error: 'Slow down.', limits: { per_minute: 5, retry_after: 30 } },
    });
    const value = describePostFailure(err).details[0].value;
    expect(value).toContain('Per minute: 5');
    expect(value).toContain('Retry after: 30');
  });

  // request_id is for a bug report, not for the person trying to post.
  it('hides plumbing fields from the user', () => {
    const err = new HttpErrorResponse({
      status: 422,
      error: { error: 'Nope.', request_id: 'abc123', field: 'status' },
    });
    const labels = describePostFailure(err).details.map((d) => d.label);
    expect(labels).not.toContain('Request id');
    expect(labels).toContain('Field');
  });

  // A body with no recognized message field still has to reach the user.
  it('still reports a body that names no known message field', () => {
    const err = new HttpErrorResponse({
      status: 422,
      error: { reason_code: 'moderation_hold', review_eta: 'about an hour' },
    });
    const failure = describePostFailure(err);
    expect(failure.message).toContain('rejected');
    expect(failure.details).toHaveLength(2);
  });
});
