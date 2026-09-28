import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { AccountListDialog } from './account-list-dialog';

describe('AccountListDialog shared states', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function render(mode: 'favourited_by' | 'reblogged_by' = 'favourited_by') {
    const fixture = TestBed.createComponent(AccountListDialog);
    fixture.componentRef.setInput('statusId', '42');
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    return fixture;
  }
  it('distinguishes failed reads from empty results and retries the same count list', () => {
    const f = render();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Loading');
    http
      .expectOne('/api/v1/statuses/42/favourited_by')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    f.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not load accounts');
    expect(el.textContent).not.toContain('Nobody yet.');
    const retry = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Retry',
    )!;
    retry.click();
    retry.click();
    f.detectChanges();
    http.expectOne('/api/v1/statuses/42/favourited_by').flush([]);
    f.detectChanges();
    expect(el.textContent).toContain('Nobody yet.');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
  it('preserves boost-list routing and dismisses on a native account link', () => {
    const f = render('reblogged_by');
    const closed = vi.fn();
    f.componentInstance.closed.subscribe(closed);
    http
      .expectOne('/api/v1/statuses/42/reblogged_by')
      .flush([
        {
          id: '7',
          username: 'reader',
          acct: 'reader@example.test',
          display_name: 'Reader',
          avatar_static: '',
          avatar: '',
        },
      ]);
    f.detectChanges();
    const link = (f.nativeElement as HTMLElement).querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/accounts/7');
    // Preserve native navigation while testing the component's dismissal output.
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(closed).toHaveBeenCalledOnce();
  });
  it('cancels an outstanding read when the dialog is removed', () => {
    const f = render();
    const request = http.expectOne('/api/v1/statuses/42/favourited_by');
    f.destroy();
    expect(request.cancelled).toBe(true);
  });
});
