import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Observability } from './observability';

function render(view?: 'api' | 'logs'): HTMLElement {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { data: of(view ? { view } : {}) } },
    ],
  });
  const fixture = TestBed.createComponent(Observability);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Observability pages', () => {
  it('keeps the dashboard to summaries, with links to the wide pages', () => {
    const el = render();
    expect(el.querySelector('app-reading-back')).toBeNull();
    expect(el.querySelector('a[href="/observability/api"]')).not.toBeNull();
    expect(el.querySelector('a[href="/observability/logs"]')).not.toBeNull();
    expect(el.querySelector('.diagnostic-list, .error-list')).toBeNull();
    expect(el.querySelector('.page-menu')).not.toBeNull();
  });

  it('gives the logs their own page, with Back', () => {
    const el = render('logs');
    expect(el.querySelector('h1')?.textContent).toContain('Logs');
    expect(el.querySelector('app-reading-back')).not.toBeNull();
    expect(el.textContent).toContain('Copy');
    expect(el.querySelector('a[href="/observability/api"]')).toBeNull();
  });

  it('gives the API calls their own page, with Back', () => {
    const el = render('api');
    expect(el.querySelector('h1')?.textContent).toContain('API calls');
    expect(el.querySelector('app-reading-back')).not.toBeNull();
    expect(el.querySelector('a[href="/observability/logs"]')).toBeNull();
  });
});
