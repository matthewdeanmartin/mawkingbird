import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import { Server } from '../../server';
import { BookmarksExportWorkbench } from './bookmarks-export-workbench';
import { ExportMastodonBookmarks } from './export-mastodon-bookmarks';

const INSTANCE = 'https://social.example';

describe('ExportMastodonBookmarks', () => {
  beforeEach(() => localStorage.clear());

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [ExportMastodonBookmarks],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ExportMastodonBookmarks);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, explains unwrapping and signs in back to this page', async () => {
    const root = await page({});
    expect(root.querySelector('h1')?.textContent).toContain('Export your Mastodon bookmarks');
    expect(root.textContent).toContain('What does "unwrap" mean?');
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fexport-mastodon-bookmarks',
    );
    expect(root.querySelector('app-bookmarks-export-workbench')).toBeNull();
  });

  it('signed in, shows the exporter instead of the pitch', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
  });
});

function post(id: string, link?: string): Status {
  return {
    id,
    created_at: '2026-01-02T03:04:05Z',
    content: link ? `<p><a href="${link}">${link}</a></p>` : '<p>no link</p>',
    spoiler_text: '',
    url: `${INSTANCE}/@alice/${id}`,
    account: { acct: 'alice' },
    reblog: null,
  } as Status;
}

describe('BookmarksExportWorkbench', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<BookmarksExportWorkbench>;
  let root: HTMLElement;
  let wb: {
    readAll(): Promise<void>;
    stop(): void;
    setMode(mode: string): void;
    download(): void;
    save(html: string, filename: string): void;
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [BookmarksExportWorkbench],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Server).setBaseUrl(INSTANCE);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BookmarksExportWorkbench);
    root = fixture.nativeElement as HTMLElement;
    wb = fixture.componentInstance as unknown as typeof wb;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    fixture.detectChanges();
  }

  function page(statuses: Status[], next?: string): void {
    const req = http.expectOne((r) => r.url.endsWith('/api/v1/bookmarks'));
    req.flush(statuses, {
      headers: next
        ? new HttpHeaders({ Link: `<${INSTANCE}/api/v1/bookmarks?max_id=${next}>; rel="next"` })
        : new HttpHeaders(),
    });
  }

  it('reads every page, then downloads the chosen shape as a bookmark file', async () => {
    const reading = wb.readAll();
    await settle();
    page([post('1', 'https://blog.example/a'), post('2')], 'b2');
    await settle();
    page([post('3', 'https://news.example/b')]);
    await reading;
    fixture.detectChanges();
    expect(root.textContent).toContain('3 bookmarks, 2 sharing a link.');

    const save = vi.spyOn(wb, 'save').mockImplementation(() => undefined);
    wb.setMode('links');
    fixture.detectChanges();
    expect(root.textContent).toContain('Download 2 bookmarks');
    wb.download();
    const [html, filename] = save.mock.calls[0];
    expect(filename).toMatch(/^mastodon-bookmarks-links-\d{4}-\d{2}-\d{2}\.html$/);
    expect(html).toContain('HREF="https://blog.example/a"');
    expect(html).toContain('HREF="https://news.example/b"');
    expect(html).not.toContain('@alice/2');
    fixture.detectChanges();
    // After the task: Mawkingbird's own bookmarks, then the next steps.
    expect(root.querySelector('a[href="/settings/connections/raindrop"]')).not.toBeNull();
    expect(root.querySelector('app-focused-next-steps')).not.toBeNull();
  });

  it('keeps what it read when stopped, and says the file is partial', async () => {
    const reading = wb.readAll();
    await settle();
    wb.stop();
    page([post('1')], 'b1');
    await reading;
    fixture.detectChanges();
    expect(root.textContent).toContain('Stopped early');
    expect(root.textContent).toContain('Download 1 bookmark');
  });

  it('keeps what it read when the server fails part-way', async () => {
    const reading = wb.readAll();
    await settle();
    page([post('1')], 'b1');
    await settle();
    http
      .expectOne((r) => r.url.endsWith('/api/v1/bookmarks'))
      .flush('down', { status: 502, statusText: 'Bad Gateway' });
    await reading;
    fixture.detectChanges();
    expect(root.textContent).toContain('stopped answering part-way (1 read)');
    expect(root.textContent).toContain('Download 1 bookmark');
  });
});
