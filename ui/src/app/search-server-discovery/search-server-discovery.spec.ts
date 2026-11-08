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

/** The shipped snapshot: the `usable` servers qualified when checked; quiet did not. */
function snapshot(usable: string[] = ['closed.example', 'open.example']) {
  return {
    version: 1,
    checkedAt: '2026-11-08T00:00:00.000Z',
    checked: usable.length + 1,
    servers: [
      ...usable.map((domain) => ({ domain, accounts: true, posts: true, tagsOnly: false })),
      { domain: 'quiet.example', accounts: false, posts: false, tagsOnly: false },
    ],
  };
}

describe('SearchServerDiscovery', () => {
  const directory = {
    source: signal<'cache' | 'bundled' | 'live'>('bundled'),
    ready: vi.fn().mockResolvedValue(undefined),
    shuffled: vi.fn().mockImplementation(() => [...SERVERS]),
  };
  let probed: string[];

  beforeEach(() => {
    localStorage.clear();
    probed = [];
    directory.ready.mockClear();
    directory.shuffled.mockClear();
    directory.shuffled.mockImplementation(() => [...SERVERS]);
    TestBed.configureTestingModule({
      imports: [SearchServerDiscovery],
      providers: [{ provide: MastodonServers, useValue: directory }],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  /** By default only open.example still answers both canaries live; others refuse. */
  function onlyOpenWorks(domain: string, type: string | null): Response {
    if (domain !== 'open.example') return jsonResponse({ error: 'unauthorized' }, 401);
    return type === 'accounts'
      ? jsonResponse({ accounts: [{ id: '1' }] })
      : jsonResponse({ statuses: [{ id: '9' }] });
  }

  /** Serves the snapshot, then answers each live confirmation with `answer`. */
  function stubFetch(
    data: unknown = snapshot(),
    answer: (domain: string, type: string | null) => Response = onlyOpenWorks,
  ): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('search-servers.json')) return jsonResponse(data);
        const parsed = new URL(url);
        probed.push(parsed.host);
        return answer(parsed.host, parsed.searchParams.get('type'));
      }),
    );
  }

  function start(fixture: { nativeElement: unknown }): void {
    const element = fixture.nativeElement as HTMLElement;
    Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Find a search server'))!
      .click();
  }

  async function waitForText(
    fixture: { detectChanges(): void; nativeElement: unknown },
    text: string,
  ): Promise<void> {
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(text);
    });
  }

  it('finds a server that answers both canaries, and waits for approval', async () => {
    stubFetch();
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    const selected: string[] = [];
    fixture.componentInstance.selected.subscribe((url) => selected.push(url));
    fixture.detectChanges();

    start(fixture);
    await waitForText(fixture, 'open.example allows anonymous search');
    // Nothing is adopted until the user says so.
    expect(selected).toEqual([]);

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Use this search server'))!
      .click();

    expect(selected).toEqual(['https://open.example']);
  });

  it('never probes a server the snapshot did not find usable', async () => {
    stubFetch();
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await waitForText(fixture, 'allows anonymous search');
    expect(probed).not.toContain('quiet.example');
  });

  it('records every failure in the reject list so the next hunt skips it', async () => {
    stubFetch();
    const rejects = TestBed.inject(SearchServerRejects);
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await waitForText(fixture, 'open.example allows anonymous search');
    expect(rejects.has('closed.example')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('search needs a login');
    // The winner is never rejected.
    expect(rejects.has('open.example')).toBe(false);
  });

  it('shows what it walked past, so a long hunt does not look stuck', async () => {
    stubFetch();
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await waitForText(fixture, 'search needs a login');
  });

  it('excludes already-rejected servers from the walk', async () => {
    TestBed.inject(SearchServerRejects).add('closed.example', 'auth-required');
    stubFetch();
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await waitForText(fixture, 'open.example allows anonymous search');
    expect(probed).not.toContain('closed.example');
  });

  it('excludes the search server already in use', async () => {
    stubFetch(snapshot(['current.example', 'open.example']));
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.componentRef.setInput('currentServer', 'https://current.example');
    fixture.detectChanges();

    start(fixture);
    await waitForText(fixture, 'open.example allows anonymous search');
    expect(probed).not.toContain('current.example');
  });

  it('rejects a server that can search accounts but serves no posts', async () => {
    // Reachable, answers, and still not adoptable — adopting it is precisely how you
    // end up with a silently dead search page.
    stubFetch(snapshot(['no-es.example']), (_domain, type) =>
      type === 'accounts'
        ? jsonResponse({ accounts: [{ id: '1' }] })
        : jsonResponse({ statuses: [] }),
    );
    const rejects = TestBed.inject(SearchServerRejects);
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await waitForText(fixture, 'No other server');
    expect(rejects.has('no-es.example')).toBe(true);
    expect(rejects.all()[0].status).toBe('ok');
  });

  it('names the tags-only failure while it scrolls past', async () => {
    // A payload with the tag in it and no posts is the failure most likely to be
    // mistaken for success, so the check says which one it was.
    stubFetch(snapshot(['tags-only.example']), (_domain, type) =>
      type === 'accounts'
        ? jsonResponse({ accounts: [{ id: '1' }] })
        : jsonResponse({ statuses: [], hashtags: [{ name: 'mastodon' }] }),
    );
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await waitForText(fixture, 'hashtags only, no posts');
  });

  it('says so when the directory has nothing left to try', async () => {
    stubFetch(snapshot([]));
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();

    start(fixture);
    await waitForText(fixture, 'None of the 1 servers');
    expect(probed).toEqual([]);
    // Checking again would only repeat the same answer.
    expect(fixture.nativeElement.textContent).not.toContain('Check again');
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
});
