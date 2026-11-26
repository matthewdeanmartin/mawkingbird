import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { Drafts } from '../drafts';
import { DraftSources } from './draft-sources';
import { DraftsRailCard, RAIL_DRAFTS, resetDraftsRailLoads } from './drafts-rail-card';

/** Explore Sprint 4 (spec/sprint/explore-2026-11.md): drafts on the right rail. */
describe('DraftsRailCard', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    resetDraftsRailLoads();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  function signIn(): void {
    const auth = TestBed.inject(Auth);
    auth.setToken('token');
    auth.account.set({ id: '1', username: 'me', acct: 'me' } as Account);
  }

  function saveDraft(text: string): void {
    TestBed.inject(Drafts).save({
      segments: [text],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
  }

  function render(): ComponentFixture<DraftsRailCard> {
    const fixture = TestBed.createComponent(DraftsRailCard);
    fixture.detectChanges();
    return fixture;
  }

  function serverRequests(): number {
    return httpMock.match(
      (req) => req.url.includes('scheduled_statuses') || req.url.includes('/statuses'),
    ).length;
  }

  it('renders nothing without drafts', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const host = render().nativeElement as HTMLElement;
    expect(host.querySelector('section')).toBeNull();
  });

  it('lists the newest local drafts, each resuming in the composer', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    for (let i = 0; i < RAIL_DRAFTS + 2; i++) saveDraft(`draft ${i}`);
    const host = render().nativeElement as HTMLElement;
    const rows = host.querySelectorAll('li a');
    expect(rows).toHaveLength(RAIL_DRAFTS);
    expect(rows[0].getAttribute('href')).toMatch(/^\/home\?draft=/);
    expect(host.textContent).toContain('5 waiting');
    expect(host.querySelector('a.more')?.getAttribute('href')).toBe('/drafts');
  });

  it('asks Anonymous’s server for nothing', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    saveDraft('local');
    render();
    expect(serverRequests()).toBe(0);
  });

  it('loads the server drafts once per session, not on every page', () => {
    signIn();
    saveDraft('local');
    render();
    TestBed.flushEffects();
    expect(serverRequests()).toBe(2);
    // The next page builds a new card; the session already has the answer.
    render();
    TestBed.flushEffects();
    expect(serverRequests()).toBe(0);
  });

  it('keeps showing local drafts when the server sources fail', () => {
    signIn();
    saveDraft('still here');
    const fixture = render();
    TestBed.flushEffects();
    for (const req of httpMock.match(() => true)) {
      req.flush('down', { status: 500, statusText: 'Server Error' });
    }
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('still here');
    expect(TestBed.inject(DraftSources).sourceErrors().length).toBe(2);
  });
});
