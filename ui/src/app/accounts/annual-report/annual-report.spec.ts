import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { AnnualReportPage } from './annual-report';

describe('AnnualReportPage', () => {
  let http: HttpTestingController;
  const year = new Date().getFullYear();

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  function setUp(params: Record<string, string>) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap(params)) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AnnualReportPage);
    fixture.detectChanges();
    return fixture;
  }

  const text = (f: { nativeElement: unknown }) =>
    (f.nativeElement as HTMLElement).textContent ?? '';

  it('lists your reports and offers to generate this year when eligible', () => {
    const f = setUp({});
    http.expectOne('/api/v1/annual_reports').flush({
      annual_reports: [{ year: year - 1, data: {} }],
      accounts: [],
      statuses: [],
    });
    http.expectOne(`/api/v1/annual_reports/${year}/state`).flush({ state: 'eligible' });
    f.detectChanges();
    const links = [...(f.nativeElement as HTMLElement).querySelectorAll('.report-list a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([`/annual-report/${year - 1}`]);
    const generate = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes(`Make my ${year} report`),
    )!;
    generate.click();
    const post = http.expectOne(`/api/v1/annual_reports/${year}/generate`);
    expect(post.request.method).toBe('POST');
    post.flush(null, { status: 202, statusText: 'Accepted' });
    f.detectChanges();
    expect(text(f)).toContain('Your server is making your');
  });

  it('says so when the server has no annual reports', () => {
    const f = setUp({});
    http.expectOne('/api/v1/annual_reports').flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne(`/api/v1/annual_reports/${year}/state`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    f.detectChanges();
    expect(text(f)).toContain("Your server doesn't offer annual reports.");
  });

  it('shows one year, falling back to the list on servers without the per-year route', () => {
    const f = setUp({ year: '2024' });
    http
      .expectOne('/api/v1/annual_reports/2024')
      .flush(null, { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/v1/annual_reports').flush({
      annual_reports: [
        { year: 2024, data: { archetype: 'replier', top_hashtags: [{ name: 'birds', count: 9 }] } },
      ],
      accounts: [],
      statuses: [],
    });
    f.detectChanges();
    expect(text(f)).toContain('Your 2024 on your server');
    expect(text(f)).toContain('Replier');
    expect(text(f)).toContain('birds');
  });

  it('reports a missing year', () => {
    const f = setUp({ year: '2019' });
    http
      .expectOne('/api/v1/annual_reports/2019')
      .flush({ annual_reports: [], accounts: [], statuses: [] });
    f.detectChanges();
    expect(text(f)).toContain('There is no 2019 report for you on your server.');
  });
});
