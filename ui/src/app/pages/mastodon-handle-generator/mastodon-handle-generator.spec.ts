import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
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
  let fixture: ComponentFixture<HandleWorkbench>;
  let root: HTMLElement;
  let wb: {
    name: { set(v: string): void };
    serverInput: { set(v: string): void };
    next(): void;
    choose(handle: string): Promise<void>;
    back(): void;
    finish(): void;
    startOver(): void;
  };

  beforeEach(async () => {
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
      { ...server('mastomini.local', 0), local: true },
    ]);
    TestBed.configureTestingModule({
      imports: [HandleWorkbench],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: MastodonServers,
          useValue: { servers: directory, ready: () => Promise.resolve() },
        },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/mastodon-handle-generator');
    fixture = TestBed.createComponent(HandleWorkbench);
    root = fixture.nativeElement as HTMLElement;
    wb = fixture.componentInstance as unknown as typeof wb;
    fixture.detectChanges();
  });

  afterEach(() => vi.unstubAllGlobals());

  async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const title = () => root.querySelector('.step-title')?.textContent?.replace(/\s+/g, ' ').trim();
  const url = () => TestBed.inject(Router).url;

  it('walks name → pick → claim → done, one step on screen at a time, the step in the URL', async () => {
    expect(title()).toBe('Step 1 of 4: Your name');
    expect(root.querySelector('.handles')).toBeNull();

    wb.name.set('Matthew Martin');
    wb.next();
    await settle();
    expect(title()).toBe('Step 2 of 4: Pick a handle');
    expect(url()).toBe('/mastodon-handle-generator?step=2');
    // The name form is gone, not scrolled past.
    expect(root.querySelector('input[name="handle-name"]')).toBeNull();
    const rows = [...root.querySelectorAll('.handles li')];
    expect(rows).toHaveLength(12);
    expect(rows[0].textContent).toContain('Taken');
    // A taken handle cannot be picked; a free one can.
    expect(rows[0].querySelector('button')?.disabled).toBe(true);
    expect(rows[1].querySelector('button')?.disabled).toBe(false);
    expect(requests.every((r) => r.startsWith('https://mastodon.social/'))).toBe(true);

    await wb.choose('matthew_martin');
    await settle();
    expect(title()).toBe('Step 3 of 4: Claim it');
    expect(url()).toBe('/mastodon-handle-generator?step=3');
    const big = [...root.querySelectorAll('.handles li')];
    expect(
      big.map((li) => li.querySelector('.handle')?.textContent?.trim().split(/\s/)[0]),
    ).toEqual(['big.example', 'down.example']);
    expect(big[0].textContent).toContain('sign-ups reviewed');
    expect(big[1].textContent).toContain("Couldn't check");
    expect(root.querySelector('a[href="https://mastodon.social/auth/sign_up"]')).not.toBeNull();
    expect(root.querySelector('app-focused-next-steps')).toBeNull();

    wb.finish();
    await settle();
    expect(title()).toBe('Step 4 of 4: Done');
    expect(root.querySelector('a[href="/login/mastodon"]')).not.toBeNull();
    expect(root.querySelector('app-focused-next-steps')).not.toBeNull();
  });

  it('marks the steps done so far, and the current one', async () => {
    wb.name.set('Matthew Martin');
    wb.next();
    await settle();
    const steps = [...root.querySelectorAll('.progress li')];
    expect(steps[0].classList).toContain('complete');
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(steps[2].classList).not.toContain('complete');
  });

  it('never shows a step there is nothing for, whatever the URL says', async () => {
    await TestBed.inject(Router).navigateByUrl('/mastodon-handle-generator?step=3');
    await settle();
    expect(title()).toBe('Step 1 of 4: Your name');
  });

  it('steps back in place when the page was opened straight on a step', async () => {
    wb.name.set('Matthew Martin');
    wb.next();
    await settle();
    // Simulate an entry the wizard did not make (a pasted ?step=2 link).
    history.replaceState(null, '');
    wb.back();
    await settle();
    expect(title()).toBe('Step 1 of 4: Your name');
    // The name is kept for another go.
    expect(root.querySelector<HTMLInputElement>('input[name="handle-name"]')?.value).toBe(
      'Matthew Martin',
    );
  });

  it('starts over from step 1 with the results cleared', async () => {
    wb.name.set('Matthew Martin');
    wb.next();
    await settle();
    await wb.choose('matthew_martin');
    await settle();
    wb.finish();
    await settle();
    wb.startOver();
    await settle();
    expect(title()).toBe('Step 1 of 4: Your name');
    expect(url()).toBe('/mastodon-handle-generator');
  });

  it('refuses a server address that is not one, without sending anything', async () => {
    wb.name.set('Matthew Martin');
    wb.serverInput.set('not a server');
    wb.next();
    await settle();
    expect(requests).toEqual([]);
    expect(title()).toBe('Step 1 of 4: Your name');
    expect(root.textContent).toContain('Type a server address');
  });
});
