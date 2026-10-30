import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MastodonServers, ServerSuggestion } from '../../mastodon-servers';
import { HandleWorkbench } from './handle-workbench';
import { MastodonHandleGenerator } from './mastodon-handle-generator';

describe('MastodonHandleGenerator', () => {
  beforeEach(() => localStorage.clear());

  it('explains handles and needs no sign-in', async () => {
    TestBed.configureTestingModule({
      imports: [MastodonHandleGenerator],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(MastodonHandleGenerator);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toContain('Mastodon handle generator');
    expect(root.textContent).toContain('No account needed');
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});

function server(domain: string, users: number, approvalRequired?: boolean): ServerSuggestion {
  return { domain, description: '', category: 'general', users, approvalRequired };
}

describe('HandleWorkbench', () => {
  /** Which handles each server already has. */
  const taken: Record<string, string[]> = {
    'mastodon.social': ['matthewmartin'],
    'big.example': ['matthew_martin'],
  };
  let requests: string[];

  beforeEach(() => {
    localStorage.clear();
    requests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requests.push(url);
        const { hostname, searchParams } = new URL(url);
        if (hostname === 'down.example') throw new TypeError('Failed to fetch');
        const name = searchParams.get('acct') ?? '';
        return new Response(null, { status: taken[hostname]?.includes(name) ? 200 : 404 });
      }),
    );
    const directory = signal<ServerSuggestion[]>([
      server('mastodon.social', 900_000, false),
      server('big.example', 300_000, true),
      server('down.example', 50_000),
      server('mastomini.local', 0),
    ]);
    directory()[3].local = true;
    TestBed.configureTestingModule({
      imports: [HandleWorkbench],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: MastodonServers,
          useValue: { servers: directory, ready: () => Promise.resolve() },
        },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function settle(fixture: { detectChanges(): void }): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    fixture.detectChanges();
  }

  it('checks every suggestion on the chosen server, then the pick on the biggest others', async () => {
    const fixture = TestBed.createComponent(HandleWorkbench);
    fixture.detectChanges();
    const wb = fixture.componentInstance as unknown as {
      name: { set(v: string): void };
      find(): void;
      choose(handle: string): Promise<void>;
    };
    wb.name.set('Matthew Martin');
    wb.find();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;

    const rows = [...root.querySelectorAll('.handles li')];
    expect(rows).toHaveLength(12);
    expect(rows[0].textContent).toContain('@matthewmartin');
    expect(rows[0].textContent).toContain('Taken');
    expect(rows[1].textContent).toContain('Looks free');
    expect(requests.every((url) => url.startsWith('https://mastodon.social/'))).toBe(true);

    await wb.choose('matthew_martin');
    await settle(fixture);
    const big = [...root.querySelectorAll('[aria-labelledby="handle-chosen-title"] .handles li')];
    // The chosen server is not repeated, and the local test server is not "big".
    expect(
      big.map((li) => li.querySelector('.handle')?.textContent?.trim().split(/\s/)[0]),
    ).toEqual(['big.example', 'down.example']);
    expect(big[0].textContent).toContain('Taken');
    expect(big[0].textContent).toContain('sign-ups reviewed');
    expect(big[1].textContent).toContain("Couldn't check");
    const signUp = root.querySelector<HTMLAnchorElement>(
      '[aria-labelledby="handle-chosen-title"] a',
    );
    expect(signUp?.getAttribute('href')).toBe('https://mastodon.social/auth/sign_up');
    expect(root.querySelector('app-focused-next-steps')).not.toBeNull();
  });

  it('refuses a server address that is not one, without sending anything', async () => {
    const fixture = TestBed.createComponent(HandleWorkbench);
    fixture.detectChanges();
    const wb = fixture.componentInstance as unknown as {
      name: { set(v: string): void };
      serverInput: { set(v: string): void };
      find(): void;
    };
    wb.name.set('Matthew Martin');
    wb.serverInput.set('not a server');
    wb.find();
    await settle(fixture);
    expect(requests).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Type a server address');
  });
});
