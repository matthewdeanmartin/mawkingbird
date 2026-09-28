import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { HistoryDialog } from './history-dialog';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { StatusEdit } from '../models';

describe('HistoryDialog shared states', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function render(server: string | null = null) {
    const f = TestBed.createComponent(HistoryDialog);
    f.componentRef.setInput('statusId', '42');
    f.componentRef.setInput('server', server);
    f.detectChanges();
    return f;
  }
  it('retries failed history without presenting it as an empty history', () => {
    const f = render();
    const el = f.nativeElement as HTMLElement;
    http
      .expectOne('/api/v1/statuses/42/history')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    f.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load edit history',
    );
    expect(el.textContent).not.toContain('No history.');
    const retry = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Retry',
    )!;
    retry.click();
    retry.click();
    f.detectChanges();
    http.expectOne('/api/v1/statuses/42/history').flush([
      {
        content: '<p>Earlier <strong>formatted</strong> text</p>',
        spoiler_text: 'Warning',
        created_at: '2026-09-28',
      },
      { content: '<p>Current text</p>', spoiler_text: '', created_at: '2026-09-29' },
    ]);
    f.detectChanges();
    expect(el.querySelectorAll('.snapshot')).toHaveLength(2);
    expect(el.querySelector('strong')?.textContent).toBe('formatted');
    expect(el.textContent).toContain('Version 1');
    expect(el.textContent).toContain('Current');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
  it('preserves the anonymous origin and native id on each retry', () => {
    const first = new Subject<StatusEdit[]>();
    const second = new Subject<StatusEdit[]>();
    const history = vi
      .spyOn(TestBed.inject(AnonymousPublicApi), 'getStatusHistory')
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const f = render('https://origin.example');
    first.error(new Error('Unavailable'));
    f.detectChanges();
    const retry = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Retry',
    )!;
    retry.click();
    f.detectChanges();
    second.next([]);
    second.complete();
    f.detectChanges();
    expect(history).toHaveBeenNthCalledWith(1, { server: 'https://origin.example', id: '42' });
    expect(history).toHaveBeenNthCalledWith(2, { server: 'https://origin.example', id: '42' });
    expect(f.nativeElement.textContent).toContain('No history.');
    http.expectNone('/api/v1/statuses/42/history');
  });
  it('cancels an outstanding history read on destruction', () => {
    const f = render();
    const request = http.expectOne('/api/v1/statuses/42/history');
    f.destroy();
    expect(request.cancelled).toBe(true);
  });
});
