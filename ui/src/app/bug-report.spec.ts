import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BugReport } from './bug-report';
import { ErrorLog } from './error-log';
import { DiagnosticLog } from './diagnostic-log';

describe('BugReport', () => {
  let report: BugReport;
  let errorLog: ErrorLog;
  let diagnosticLog: DiagnosticLog;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BugReport, ErrorLog, provideHttpClient(), provideHttpClientTesting()],
    });
    report = TestBed.inject(BugReport);
    errorLog = TestBed.inject(ErrorLog);
    diagnosticLog = TestBed.inject(DiagnosticLog);
  });

  it('includes the user description and an environment section', () => {
    const md = report.buildMarkdown({ description: 'It broke on load', includeErrors: false });
    expect(md).toContain('### What happened');
    expect(md).toContain('It broke on load');
    expect(md).toContain('### Environment');
    expect(md).toContain('**Browser:**');
  });

  it('falls back gracefully when the description is empty', () => {
    const md = report.buildMarkdown({ description: '   ', includeErrors: false });
    expect(md).toContain('_(no description provided)_');
  });

  it('omits the errors section when told not to include it', () => {
    errorLog.record('angular', new Error('boom'));
    const md = report.buildMarkdown({ description: 'x', includeErrors: false });
    expect(md).not.toContain('### Recent errors');
  });

  it('includes captured errors when asked', () => {
    errorLog.record('window-error', new Error('kaboom'));
    const md = report.buildMarkdown({ description: 'x', includeErrors: true });
    expect(md).toContain('### Recent errors');
    expect(md).toContain('kaboom');
  });

  it('includes recent diagnostics when asked', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    diagnosticLog.write('info', 'Mockingbird Action', 'user:activate', {
      route: '/home',
      target: 'app-home > button > retry',
    });

    const md = report.buildMarkdown({
      description: 'x',
      includeErrors: false,
      includeDiagnostics: true,
    });

    expect(info).toHaveBeenCalled();
    expect(md).toContain('### Recent diagnostics');
    expect(md).toContain('user:activate');
    expect(md).toContain('/home');
  });

  it('never includes the query string of the current page', () => {
    const original = `${location.pathname}${location.search}${location.hash}`;
    history.replaceState(null, '', '/private-path?access_token=secret#secret-fragment');

    try {
      const md = report.buildMarkdown({ description: 'x', includeErrors: false });
      const pageLine = md.split('\n').find((l) => l.includes('**Page:**')) ?? '';
      expect(pageLine).toContain('/private-path');
      expect(pageLine).not.toContain('secret');
      expect(pageLine).not.toContain('?');
      expect(pageLine).not.toContain('#');
    } finally {
      history.replaceState(null, '', original);
    }
  });

  it('derives a titled issue subject from the first line', () => {
    expect(
      report.buildTitle({ description: 'Login button dead\nmore', includeErrors: false }),
    ).toBe('Bug: Login button dead');
    expect(report.buildTitle({ description: '', includeErrors: false })).toBe('Bug report');
  });

  it('builds a GitHub issue URL with title and body query params', () => {
    const url = report.buildGithubUrl({ description: 'Broken thing', includeErrors: false });
    expect(url).toContain('https://github.com/matthewdeanmartin/mawkingbird/issues/new?');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('title')).toBe('Bug: Broken thing');
    expect(parsed.searchParams.get('body')).toContain('### What happened');
  });

  it('truncates an over-long body so the GitHub URL stays acceptable', () => {
    const huge = 'x'.repeat(10_000);
    const url = report.buildGithubUrl({ description: huge, includeErrors: false });
    const body = new URL(url).searchParams.get('body') ?? '';
    expect(body).toContain('truncated for the URL');
    expect(body.length).toBeLessThan(6_500);
  });
});
