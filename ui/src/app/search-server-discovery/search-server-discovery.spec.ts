import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MastodonServers, ServerSuggestion } from '../mastodon-servers';
import { SearchServerRejects } from '../search-server-rejects';
import { SearchServerDiscovery } from './search-server-discovery';

const SERVERS: ServerSuggestion[] = [
  {
    domain: 'closed.example',
    description: 'Search needs a login.',
    category: 'general',
    users: 10,
  },
  { domain: 'open.example', description: 'Search works here.', category: 'tech', users: 2_000 },
];

/** Minimal stand-in for the bits of Response the probe reads. */
function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('SearchServerDiscovery', () => {
  const directory = {
    source: signal<'cache' | 'bundled' | 'live'>('bundled'),
    ready: vi.fn().mockResolvedValue(undefined),
    shuffled: vi.fn().mockImplementation(() => [...SERVERS]),
  };

  beforeEach(() => {
    localStorage.clear();
    directory.ready.mockClear();
    directory.shuffled.mockClear();
    directory.shuffled.mockImplementation(() => [...SERVERS]);
    TestBed.configureTestingModule({
      imports: [SearchServerDiscovery],
      providers: [{ provide: MastodonServers, useValue: directory }],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  /** One server answers both canaries; everything else refuses. */
  function stubFetchWhereOnlyOpenWorks(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (!url.includes('open.example')) {
          return jsonResponse({ error: 'unauthorized' }, 401);
        }
        return new URL(url).searchParams.get('type') === 'accounts'
          ? jsonResponse({ accounts: [{ id: '1' }] })
          : jsonResponse({ statuses: [{ id: '9' }] });
      }),
    );
  }

  function start(fixture: { nativeElement: unknown }): void {
    const element = fixture.nativeElement as HTMLElement;
    Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Find a search server'))!
      .click();
  }

  it('finds a server that answers both canaries, and waits for approval', async () => {
    stubFetchWhereOnlyOpenWorks();
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    const selected: string[] = [];
    fixture.componentInstance.selected.subscribe((url) => selected.push(url));
    fixture.detectChanges();

    start(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('open.example allows anonymous search');
    });
    // Nothing is adopted until the user says so.
    expect(selected).toEqual([]);

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Use this search server'))!
      .click();

    expect(selected).toEqual(['https://open.example']);
  });

  it('records every failure in the reject list so the next hunt skips it', async () => {
    stubFetchWhereOnlyOpenWorks();
    const rejects = TestBed.inject(SearchServerRejects);
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(rejects.has('closed.example')).toBe(true);
    });
    // The winner is never rejected.
    expect(rejects.has('open.example')).toBe(false);
  });

  it('excludes already-rejected servers from the walk', async () => {
    TestBed.inject(SearchServerRejects).add('closed.example', 'auth-required');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ accounts: [] })),
    );
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await vi.waitFor(() => expect(directory.shuffled).toHaveBeenCalled());

    const excluded = directory.shuffled.mock.calls[0][0] as Set<string>;
    expect(excluded.has('closed.example')).toBe(true);
  });

  it('excludes the search server already in use', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ accounts: [] })),
    );
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.componentRef.setInput('currentServer', 'https://current.example');
    fixture.detectChanges();

    start(fixture);
    await vi.waitFor(() => expect(directory.shuffled).toHaveBeenCalled());

    expect((directory.shuffled.mock.calls[0][0] as Set<string>).has('current.example')).toBe(true);
  });

  it('rejects a server that can search accounts but serves no posts', async () => {
    // Reachable, answers, and still not adoptable — adopting it is precisely how you
    // end up with a silently dead search page.
    directory.shuffled.mockImplementation(() => [
      { domain: 'no-es.example', description: '', category: '', users: 20_000 },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new URL(url).searchParams.get('type') === 'accounts'
          ? jsonResponse({ accounts: [{ id: '1' }] })
          : jsonResponse({ statuses: [] }),
      ),
    );
    const rejects = TestBed.inject(SearchServerRejects);
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Couldn’t find');
    });
    expect(rejects.has('no-es.example')).toBe(true);
    expect(rejects.all()[0].status).toBe('ok');
  });

  it('names the tags-only failure while it scrolls past', async () => {
    // A payload with the tag in it and no posts is the failure most likely to be
    // mistaken for success, so the hunt says which one it was.
    directory.shuffled.mockImplementation(() => [
      { domain: 'tags-only.example', description: '', category: '', users: 20_000 },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new URL(url).searchParams.get('type') === 'accounts'
          ? jsonResponse({ accounts: [{ id: '1' }] })
          : jsonResponse({ statuses: [], hashtags: [{ name: 'mastodon' }] }),
      ),
    );
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('hashtags only, no posts');
    });
  });

  it('shows what it walked past, so a long hunt does not look stuck', async () => {
    stubFetchWhereOnlyOpenWorks();
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('search needs a login');
    });
  });

  it('offers to forget the reject list, and does', async () => {
    const rejects = TestBed.inject(SearchServerRejects);
    rejects.add('a.example', 'auth-required');
    rejects.add('b.example', 'no-results');
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Skipping 2 servers');
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Forget them'))!
      .click();
    fixture.detectChanges();

    expect(rejects.count()).toBe(0);
  });

  it('says so when the directory has nothing left to try', async () => {
    directory.shuffled.mockImplementation(() => []);
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Couldn’t find');
    });
  });
});
