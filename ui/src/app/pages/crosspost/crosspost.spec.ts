import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { Crosspost } from './crosspost';
import { CrosspostWorkbench } from './crosspost-workbench';

describe('Crosspost', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [Crosspost],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(Crosspost);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, offers either network and comes back here afterwards', async () => {
    const links = [...(await page({})).querySelectorAll('.sign-in-choices a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual([
      '/login/mastodon?next=%2Fcrosspost',
      '/login/bluesky?next=%2Fcrosspost',
    ]);
  });

  it('signed in, leaves the sign-in buttons to the shell’s account menu', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.sign-in-choices')).toBeNull();
    expect(root.querySelector('header')).toBeNull();
  });
});

describe('CrosspostWorkbench', () => {
  const linked = signal(false);

  beforeEach(() => {
    localStorage.clear();
    linked.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: BlueskySession, useValue: { linked, session: signal(null) } },
      ],
    });
  });

  function target(): string | undefined {
    const fixture = TestBed.createComponent(CrosspostWorkbench);
    return (fixture.componentInstance as unknown as { target(): string }).target();
  }

  it('aims at Mastodon alone until Bluesky is linked, then at both', () => {
    TestBed.inject(Auth).setToken('token');
    expect(target()).toBe('fedi');
    linked.set(true);
    expect(target()).toBe('both');
  });

  it('works for a Bluesky account with no Mastodon yet', () => {
    linked.set(true);
    expect(target()).toBe('bsky');
  });
});
