import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaDownloadDialog, MediaPageLoader } from './media-download-dialog';
import { Auth } from '../auth';
import { Server } from '../server';
import { Status } from '../models';

interface DialogState {
  fetcher: typeof fetch;
  save: (blob: Blob, name: string) => void;
  saveGapMs: number;
  format: ReturnType<typeof signal<'zip' | 'files'>>;
  includeBoosts: ReturnType<typeof signal<boolean>>;
  cap: ReturnType<typeof signal<number>>;
  phase(): string;
  saved(): number;
  start(): Promise<void>;
  stop(): void;
}

function post(id: string, urls: string[], over: Partial<Status> = {}): Status {
  return {
    id,
    created_at: '2026-10-30T00:00:00Z',
    account: { acct: 'ann' },
    url: `https://home.test/@ann/${id}`,
    sensitive: false,
    spoiler_text: '',
    reblog: null,
    content: '',
    media_attachments: urls.map((url, index) => ({
      id: `${id}-${index}`,
      type: 'image',
      url,
      preview_url: url,
      description: null,
    })),
    ...over,
  } as Status;
}

describe('MediaDownloadDialog', () => {
  let fixture: ComponentFixture<MediaDownloadDialog>;
  let state: DialogState;
  let saves: { name: string; size: number }[];
  let finish: ReturnType<typeof vi.fn>;
  const descriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );

  /** Hosts in `refuse` behave like a media server without CORS headers. */
  function serve(refuse: string[] = []): typeof fetch {
    return vi.fn(async (url: RequestInfo | URL) => {
      if (refuse.some((host) => String(url).includes(host))) throw new TypeError('Failed to fetch');
      return new Response(`bytes of ${url}`);
    }) as unknown as typeof fetch;
  }

  function create(inputs: Record<string, unknown>): void {
    fixture = TestBed.createComponent(MediaDownloadDialog);
    finish = vi.fn();
    fixture.componentRef.setInput('finish', finish);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    state = fixture.componentInstance as unknown as DialogState;
    saves = [];
    state.save = (blob, name) => saves.push({ name, size: blob.size });
    state.saveGapMs = 0;
  }

  beforeEach(() => {
    for (const [name] of descriptors)
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
    TestBed.configureTestingModule({
      imports: [MediaDownloadDialog],
      providers: [
        { provide: Auth, useValue: { kind: signal('mastodon'), token: signal('one') } },
        { provide: Server, useValue: { baseUrl: signal('https://home.test') } },
      ],
    });
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    for (const [name, descriptor] of descriptors)
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });

  it('zips what it can fetch and lists the rest as links to open by hand', async () => {
    create({
      statuses: [post('1', ['https://ok.test/a.jpg', 'https://nocors.test/b.jpg'])],
      archiveName: 'media-bsky:at://x',
    });
    state.fetcher = serve(['nocors.test']);

    await state.start();
    fixture.detectChanges();

    expect(saves.map((save) => save.name)).toEqual(['media-bsky_at_x.zip']);
    expect(state.saved()).toBe(1);
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('ul.failed a')];
    expect(links.map((link) => [link.getAttribute('href'), link.textContent?.trim()])).toEqual([
      ['https://nocors.test/b.jpg', 'ann-2026-10-30-1-2.jpg'],
    ]);
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('saves each file separately, in post order, when asked', async () => {
    create({ statuses: [post('1', ['https://ok.test/a.jpg', 'https://ok.test/b.png'])] });
    state.fetcher = serve();
    state.format.set('files');

    await state.start();

    expect(saves.map((save) => save.name)).toEqual([
      'ann-2026-10-30-1-1.jpg',
      'ann-2026-10-30-1-2.png',
    ]);
    expect(state.phase()).toBe('done');
  });

  it('pages a profile back until it has the chosen number of media posts', async () => {
    const pages = [
      Array.from({ length: 40 }, (_, i) => post(`a${i}`, [`https://ok.test/a${i}.jpg`])),
      Array.from({ length: 40 }, (_, i) => post(`b${i}`, [`https://ok.test/b${i}.jpg`])),
      [post('never', ['https://ok.test/never.jpg'])],
    ];
    const loader = vi.fn<MediaPageLoader>((cursor) =>
      of(
        !cursor
          ? pages[0]
          : cursor.id.startsWith('a')
            ? pages[1]
            : cursor.id.startsWith('b')
              ? pages[2]
              : [],
      ),
    );
    create({ scope: 'profile', loadPage: loader });
    state.fetcher = serve();
    state.format.set('files');
    state.includeBoosts.set(true);
    state.cap.set(40);

    await state.start();

    expect(loader).toHaveBeenCalledOnce();
    expect(loader).toHaveBeenCalledWith(undefined, true);
    expect(saves).toHaveLength(40);

    saves.length = 0;
    loader.mockClear();
    state.cap.set(200);
    await state.start();
    expect(loader.mock.calls.map(([cursor]) => cursor?.id)).toEqual([
      undefined,
      'a39',
      'b39',
      'never',
    ]);
    expect(saves).toHaveLength(81);
  });

  it('stops on request without saving anything', async () => {
    create({ statuses: [post('1', ['https://slow.test/a.jpg'])] });
    state.fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
        ),
    ) as unknown as typeof fetch;

    const run = state.start();
    expect(state.phase()).toBe('working');
    await vi.waitFor(() => expect(state.fetcher).toHaveBeenCalled());
    state.stop();
    await run;

    expect(state.phase()).toBe('choose');
    expect(saves).toEqual([]);
    expect(finish).not.toHaveBeenCalled();
  });
});
