import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { Account, Status } from '../../models';
import { DownloadMastodonImages } from './download-mastodon-images';
import { MediaDownloadWorkbench } from './media-download-workbench';
import {
  ANONYMOUS_SEARCH_SERVER,
  AccountSource,
  AccountSources,
  pagingId,
  parseAccountInput,
} from './account-source';

function account(over: Partial<Account> = {}): Account {
  return {
    id: '7',
    username: 'ann',
    acct: 'ann@pics.example',
    display_name: 'Ann',
    url: 'https://pics.example/@ann',
    avatar: 'https://pics.example/a.png',
    avatar_static: 'https://pics.example/a.png',
    ...over,
  } as Account;
}

function photo(id: string): Status {
  return {
    id,
    created_at: '2026-10-30T00:00:00Z',
    account: account(),
    url: `https://pics.example/@ann/${id}`,
    sensitive: false,
    spoiler_text: '',
    reblog: null,
    content: '',
    media_attachments: [
      {
        id: `m${id}`,
        type: 'image',
        url: `https://pics.example/${id}.jpg`,
        preview_url: `https://pics.example/${id}-s.jpg`,
        description: null,
      },
    ],
  } as Status;
}

const dialogMethods = ['showModal', 'close'].map(
  (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
);
function stubDialogs(): void {
  for (const [name] of dialogMethods)
    Object.defineProperty(HTMLDialogElement.prototype, name, {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = name === 'showModal';
      },
    });
}
function restoreDialogs(): void {
  for (const [name, descriptor] of dialogMethods)
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
}

describe('DownloadMastodonImages page', () => {
  async function render(inShell: boolean, lang?: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [DownloadMastodonImages],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { inShell, lang }, queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(DownloadMastodonImages);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('works without an account and offers a sign-in that returns to the tool', async () => {
    const root = await render(false);
    expect(root.querySelector('h1')?.textContent).toContain('Download images from Mastodon');
    expect(root.textContent).toContain('No account needed');
    const signIn = root.querySelector<HTMLAnchorElement>('.sign-in-choices a')!;
    expect(signIn.getAttribute('href')).toBe('/login/mastodon?next=%2Fdownload-mastodon-images');
  });

  it('drops its own header and sign-in inside the signed-in shell', async () => {
    const root = await render(true);
    expect(root.querySelector('header')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });

  it('is written in German on its German route, and signs in back to it', async () => {
    const root = await render(false, 'de');
    expect(root.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(root.querySelector('h1')?.textContent).toBe('Bilder von Mastodon herunterladen');
    expect(root.textContent).toContain('Kein Konto nötig');
    expect(root.querySelector('.questions h2')?.textContent).toBe('Fragen');
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fde%2Fmastodon-bilder-herunterladen',
    );
  });
});

describe('parseAccountInput', () => {
  it('understands handles, profile links and plain names', () => {
    expect(parseAccountInput('@Ann@Pics.Example')).toEqual({
      kind: 'handle',
      username: 'Ann',
      host: 'pics.example',
    });
    expect(parseAccountInput('ann@pics.example')).toEqual({
      kind: 'handle',
      username: 'ann',
      host: 'pics.example',
    });
    expect(parseAccountInput('https://pics.example/@ann')).toEqual({
      kind: 'handle',
      username: 'ann',
      host: 'pics.example',
    });
    expect(parseAccountInput('pics.example/users/ann/')).toEqual({
      kind: 'handle',
      username: 'ann',
      host: 'pics.example',
    });
    expect(parseAccountInput('@ann')).toEqual({ kind: 'query', query: 'ann' });
    expect(parseAccountInput('Ann Example')).toEqual({ kind: 'query', query: 'Ann Example' });
    expect(parseAccountInput('   ')).toBeNull();
  });
});

describe('AccountSources', () => {
  let http: HttpTestingController;
  let api: { search: ReturnType<typeof vi.fn>; getAccountStatuses: ReturnType<typeof vi.fn> };
  const kind = signal<string>('anonymous');
  const token = signal<string | null>(null);

  beforeEach(() => {
    kind.set('anonymous');
    token.set(null);
    api = { search: vi.fn(), getAccountStatuses: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Api, useValue: api },
        { provide: Auth, useValue: { kind, token } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('looks a handle up on its own server first', async () => {
    const found = TestBed.inject(AccountSources).find(parseAccountInput('@ann@pics.example')!);
    http
      .expectOne(
        (r) =>
          r.url === 'https://pics.example/api/v1/accounts/lookup' && r.params.get('acct') === 'ann',
      )
      .flush(account());
    expect((await found).map((a) => a.acct)).toEqual(['ann@pics.example']);
  });

  it('searches the big public server when signed out and the handle lookup fails', async () => {
    const found = TestBed.inject(AccountSources).find(parseAccountInput('@ann@pics.example')!);
    http
      .expectOne('https://pics.example/api/v1/accounts/lookup?acct=ann')
      .flush('', { status: 404, statusText: 'Not Found' });
    await Promise.resolve();
    const search = http.expectOne((r) => r.url === `${ANONYMOUS_SEARCH_SERVER}/api/v2/search`);
    expect(search.request.params.get('q')).toBe('ann@pics.example');
    expect(search.request.params.has('resolve')).toBe(false);
    search.flush({
      accounts: [account(), account({ id: '8', acct: 'ann@other.example' })],
      statuses: [],
      hashtags: [],
    });
    expect(await found).toHaveLength(2);
  });

  it('searches your own server, resolving, when signed in', async () => {
    kind.set('mastodon');
    token.set('t');
    api.search.mockReturnValue(of({ accounts: [account()], statuses: [], hashtags: [] }));
    expect(await TestBed.inject(AccountSources).find({ kind: 'query', query: 'ann' })).toHaveLength(
      1,
    );
    expect(api.search).toHaveBeenCalledWith('ann', 'accounts', { resolve: true, limit: 10 });
  });

  it("reads posts from the account's home server, falling back to where it was found", async () => {
    const sources = TestBed.inject(AccountSources);
    const home = sources.open(account({ id: 'remote-id' }));
    http
      .expectOne('https://pics.example/api/v1/accounts/lookup?acct=ann')
      .flush(account({ id: 'home-id' }));
    const source = await home;
    expect(source.server).toBe('pics.example');
    const posts = firstValueFrom(source.page({ onlyMedia: true, limit: 40 }));
    const req = http.expectOne(
      (r) => r.url === 'https://pics.example/api/v1/accounts/home-id/statuses',
    );
    expect(req.request.params.get('only_media')).toBe('true');
    req.flush([photo('1')]);
    expect(pagingId((await posts)[0])).toBe('1');

    const fallback = sources.open(account({ id: 'social-id' }));
    http
      .expectOne('https://pics.example/api/v1/accounts/lookup?acct=ann')
      .flush('', { status: 401, statusText: 'Unauthorized' });
    const found = await fallback;
    expect(found.server).toBe('mastodon.social');
    void firstValueFrom(found.page({}));
    http.expectOne(`${ANONYMOUS_SEARCH_SERVER}/api/v1/accounts/social-id/statuses`).flush([]);
  });
});

describe('MediaDownloadWorkbench', () => {
  let fixture: ComponentFixture<MediaDownloadWorkbench>;
  let root: HTMLElement;
  let sources: { find: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> };
  let page: ReturnType<typeof vi.fn<AccountSource['page']>>;
  let wb: {
    text: { set(v: string): void };
    find(): Promise<void>;
    choose(a: Account): Promise<void>;
    loadPage: (cursor: Status | undefined, boosts: boolean) => unknown;
  };

  async function setUp(acct?: string): Promise<void> {
    stubDialogs();
    page = vi.fn<AccountSource['page']>(() => of([photo('1'), photo('2')]));
    sources = {
      find: vi.fn(async () => [account()]),
      open: vi.fn(async (a: Account): Promise<AccountSource> => ({
        account: a,
        server: 'pics.example',
        page,
      })),
    };
    TestBed.configureTestingModule({
      imports: [MediaDownloadWorkbench],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AccountSources, useValue: sources },
        { provide: Auth, useValue: { kind: signal('anonymous'), token: signal(null) } },
        { provide: Server, useValue: { baseUrl: signal('https://home.test') } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: {}, queryParamMap: convertToParamMap(acct ? { acct } : {}) },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(MediaDownloadWorkbench);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
    wb = fixture.componentInstance as unknown as typeof wb;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    restoreDialogs();
    vi.restoreAllMocks();
  });

  it('shows the media wall for an account that resolves, and remembers it in the URL', async () => {
    await setUp();
    wb.text.set('@ann@pics.example');
    await wb.find();
    fixture.detectChanges();
    expect(page).toHaveBeenCalledWith({
      onlyMedia: true,
      excludeReblogs: true,
      limit: 40,
      maxId: undefined,
    });
    expect(root.querySelectorAll('.media-tile')).toHaveLength(2);
    expect(root.querySelector('#media-owner')?.textContent).toContain('Ann');
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { acct: 'ann@pics.example' }, replaceUrl: true }),
    );
  });

  it('opens on the account named in ?acct=', async () => {
    await setUp('ann@pics.example');
    expect(sources.find).toHaveBeenCalledWith({
      kind: 'handle',
      username: 'ann',
      host: 'pics.example',
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelectorAll('.media-tile')).toHaveLength(2);
    });
  });

  it('asks which account when several match, and says so when none do', async () => {
    await setUp();
    sources.find.mockResolvedValueOnce([
      account(),
      account({ id: '8', acct: 'ann@other.example', url: 'https://other.example/@ann' }),
    ]);
    wb.text.set('ann');
    await wb.find();
    fixture.detectChanges();
    const picks = [...root.querySelectorAll<HTMLButtonElement>('mb-dialog .candidates button')];
    expect(picks.map((b) => b.querySelector('small')?.textContent)).toEqual([
      '@ann@pics.example',
      '@ann@other.example',
    ]);
    expect(sources.open).not.toHaveBeenCalled();

    picks[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(sources.open).toHaveBeenCalledWith(expect.objectContaining({ id: '8' }));
    expect(root.querySelector('mb-dialog .candidates')).toBeNull();

    sources.find.mockResolvedValueOnce([]);
    wb.text.set('nobody');
    await wb.find();
    fixture.detectChanges();
    expect(root.querySelector('mb-notice')?.textContent).toContain('No Mastodon account matched');
  });

  it('opens the download dialog, which pages the same account with or without boosts', async () => {
    await setUp();
    wb.text.set('@ann@pics.example');
    await wb.find();
    fixture.detectChanges();
    const button = [...root.querySelectorAll<HTMLButtonElement>('.download-bar button')][0];
    expect(button.textContent?.trim()).toBe('Download media…');
    button.click();
    fixture.detectChanges();
    expect(root.querySelector('app-media-download-dialog')).not.toBeNull();

    page.mockClear();
    wb.loadPage(photo('2'), true);
    expect(page).toHaveBeenCalledWith({
      onlyMedia: false,
      excludeReblogs: false,
      limit: 40,
      maxId: '2',
    });
  });
});
