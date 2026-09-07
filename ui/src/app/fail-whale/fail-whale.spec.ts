import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { Server } from '../server';
import { Auth } from '../auth';
import { ServerHealth } from '../server-health';
import { FailWhale } from './fail-whale';

describe('FailWhale', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [FailWhale],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(FailWhale);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the generic title and no status link against the mock', () => {
    const el = render();
    expect(el.querySelector('h1')!.textContent).toContain("Can't reach the server");
    // Scoped to the action row: the diagnostics box has its own (always-present)
    // link to the connection doctor, which is not a status-page link.
    expect(el.querySelector('.actions a')).toBeNull();
  });

  it('names the instance and links its official status page when registered', () => {
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    const el = render();
    expect(el.querySelector('h1')!.textContent).toContain(
      'mastodon.social appears to be unavailable',
    );
    const link = el.querySelector('.actions a')!;
    expect(link.getAttribute('href')).toBe('https://status.mastodon.social/');
    expect(link.textContent).toContain('Check instance status');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('offers the labelled third-party fallback for unregistered instances', () => {
    TestBed.inject(Server).setBaseUrl('https://example.social');
    const el = render();
    httpMock.expectOne('/api/v1/instance/extended_description').flush({ content: '' });
    const link = el.querySelector('.actions a')!;
    expect(link.getAttribute('href')).toBe('https://fediverse.observer/example.social');
    expect(link.textContent).toContain('View third-party uptime information');
  });

  // ---------------------------------------------------------------- diagnostics

  it('shows the recorded failure and always offers the connection doctor', () => {
    TestBed.inject(ServerHealth).markDown(
      new HttpErrorResponse({
        status: 0,
        url: 'https://mastodon.social/api/v1/timelines/home',
        statusText: 'Unknown Error',
      }),
    );
    const el = render();

    const details = el.querySelector('.diagnostics')!;
    expect(details.textContent).toContain('no response reached the browser');
    expect(details.textContent).toContain('/api/v1/timelines/home');
    // The doctor is offered whether or not the instance looks like the culprit.
    expect(details.querySelector('a')!.getAttribute('href')).toBe('/settings/connections/doctor');
  });

  it('says so plainly rather than showing an empty box when nothing was recorded', () => {
    const el = render();
    expect(el.querySelector('.diagnostics')!.textContent).toContain(
      'No error details were recorded',
    );
  });

  it('calls out being offline, which is a different problem from a dead server', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    TestBed.inject(ServerHealth).markDown(new HttpErrorResponse({ status: 0, url: '/api/v1/x' }));
    const el = render();
    expect(el.querySelector('.offline-note')!.textContent).toContain('offline');
    onLine.mockRestore();
  });

  it('keeps the first failure, not the pile-up behind it', () => {
    const health = TestBed.inject(ServerHealth);
    health.markDown(new HttpErrorResponse({ status: 0, url: '/api/v1/first' }));
    health.markDown(new HttpErrorResponse({ status: 503, url: '/api/v1/later' }));
    expect(health.failure()?.url).toBe('/api/v1/first');
  });

  it('forgets the failure once the server answers again', () => {
    const health = TestBed.inject(ServerHealth);
    health.markDown(new HttpErrorResponse({ status: 0, url: '/api/v1/x' }));
    health.markUp();
    expect(health.failure()).toBeNull();
  });

  // ---------------------------------------------------------------- change server (anonymous)

  it('does not offer the instance picker to a non-anonymous session', () => {
    const el = render();
    expect(el.querySelector('app-server-picker')).toBeNull();
    expect(el.querySelector('.change-server')).toBeNull();
  });

  it('offers the instance picker to an anonymous session', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const el = render();
    expect(el.querySelector('app-server-picker')).not.toBeNull();
    expect(el.querySelector('.change-server')!.textContent).toContain(
      'browse a different instance',
    );
  });

  it('picking a server moves the anonymous identity and reloads', () => {
    const auth = TestBed.inject(Auth);
    auth.enterAnonymous('https://mastodon.social');
    const fixture: ComponentFixture<FailWhale> = TestBed.createComponent(FailWhale);
    fixture.detectChanges();

    const enterSpy = vi.spyOn(auth, 'enterAnonymous');
    // Stub the reload seam so the test runner isn't navigated.
    const reloadSpy = vi
      .spyOn(fixture.componentInstance as unknown as { reload: () => void }, 'reload')
      .mockImplementation(() => undefined);

    fixture.componentInstance.onServerPicked('https://mstdn.social');

    expect(enterSpy).toHaveBeenCalledWith('https://mstdn.social');
    expect(reloadSpy).toHaveBeenCalled();
  });
});
