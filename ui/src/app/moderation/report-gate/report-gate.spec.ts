import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fedicensusFor, loadFedicensus } from '../jurisdiction/fedicensus';
import { jurisdictionFor, JurisdictionRecord } from '../jurisdiction/jurisdiction';
import {
  gateFingerprint,
  ReportGate,
  ReportGateAcknowledgements,
  ReportGateModel,
} from './report-gate';

const HELSINKI: JurisdictionRecord = {
  jurisdiction: 'Helsinki, Finland',
  quote: 'These terms are governed by the laws of Finland; disputes go to Helsinki District Court.',
  source: 'terms',
  crawledAt: '2026-11-30',
  hash: 'sha256:abc',
};

describe('jurisdictionFor', () => {
  const file = { generatedAt: '2026-11-30', servers: { 'mastodon.example': HELSINKI } };

  it('finds a server by host or by URL, case-insensitively', () => {
    expect(jurisdictionFor('mastodon.example', file)).toBe(HELSINKI);
    expect(jurisdictionFor('https://Mastodon.Example/about', file)).toBe(HELSINKI);
    expect(jurisdictionFor('other.example', file)).toBeUndefined();
    expect(jurisdictionFor('', file)).toBeUndefined();
  });

  it('ships what mastodon.social says about itself, with the sentence that says it', () => {
    const record = jurisdictionFor('mastodon.social');
    expect(record?.jurisdiction).toBe('Germany');
    expect(record?.quote).toContain('governed by the laws of Germany');
  });
});

describe('gateFingerprint', () => {
  it('prefers the crawl hash, then the terms date, then a constant', () => {
    expect(gateFingerprint(HELSINKI, '2026-01-01')).toBe('sha256:abc');
    expect(gateFingerprint(undefined, '2026-01-01')).toBe('terms:2026-01-01');
    expect(gateFingerprint(undefined, null)).toBe('none');
  });
});

describe('ReportGateAcknowledgements', () => {
  beforeEach(() => localStorage.clear());

  it('remembers one fingerprint per host', () => {
    const acks = TestBed.inject(ReportGateAcknowledgements);
    expect(acks.seen('a.example')).toBe(false);
    acks.acknowledge('a.example', 'terms:1');
    expect(acks.acknowledged('a.example', 'terms:1')).toBe(true);
    expect(acks.acknowledged('a.example', 'terms:2')).toBe(false);
    expect(acks.seen('a.example')).toBe(true);
    expect(acks.seen('b.example')).toBe(false);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('mockingbird_report_gate_v1', '{nope');
    expect(TestBed.inject(ReportGateAcknowledgements).seen('a.example')).toBe(false);
  });
});

describe('ReportGate', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(record: JurisdictionRecord | undefined): HTMLElement {
    const model = TestBed.inject(ReportGateModel);
    (model as unknown as { record: unknown }).record = signal(record);
    model.load();
    http.expectOne('/api/v1/instance/rules').flush([{ id: '1', text: 'Be nice', hint: '' }]);
    http.expectOne('/api/v1/instance/terms_of_service').flush({
      effective_date: '2026-01-01',
      effective: true,
      content: 'Terms',
      succeeded_by: null,
    });
    const fixture = TestBed.createComponent(ReportGate);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('states the crawled jurisdiction with its date, the quote and the warning', () => {
    const el = render(HELSINKI);
    const text = el.textContent ?? '';
    expect(text).toContain('When last crawled (2026-11-30)');
    expect(text).toContain('Helsinki, Finland');
    expect(el.querySelector('.gate-quote blockquote')?.textContent).toContain('laws of Finland');
    expect(text).toContain('Read the Terms of Service or About page');
    expect(text).not.toContain('legal advice');
    expect(text).toContain('has published 1 rule.');
    expect(el.querySelector('a[href$="/terms-of-service"]')).not.toBeNull();
    expect(el.querySelector('a[href$="/about"]')).not.toBeNull();
  });

  it('falls back on what Fedicensus found, as evidence, with credit', async () => {
    const model = TestBed.inject(ReportGateModel);
    (model as unknown as { host: unknown }).host = signal('mastodon.social');
    (model as unknown as { record: unknown }).record = signal(undefined);
    const fixture = TestBed.createComponent(ReportGate);
    model.load();
    http.expectOne('/api/v1/instance/rules').flush([]);
    http.expectOne('/api/v1/instance/terms_of_service').flush(null);
    await loadFedicensus();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('mastodon.social’s policies mention Germany.');
    expect(text).toContain('Digital Services Act');
    expect(text).toContain('Mastodon GmbH');
    expect(text).toContain('a mention may not mean that law applies');
    expect(text).not.toContain('We have not recorded');
    expect(
      el.querySelector('a[href="https://fedicensus.org/servers/mastodon.social/"]'),
    ).not.toBeNull();
    expect(el.querySelector('a[href*="creativecommons.org/licenses/by/4.0"]')).not.toBeNull();
  });

  it('does not consult Fedicensus when our own extraction has an answer', async () => {
    const text = render(HELSINKI).textContent ?? '';
    await loadFedicensus();
    expect(text).not.toContain('policies mention');
    expect(TestBed.inject(ReportGateModel).census()).toBeUndefined();
  });

  it('does not mistake an object property for a server', () => {
    const file = { date: '2026-09-10', servers: {} };
    expect(fedicensusFor(file, 'constructor')).toBeUndefined();
  });

  it('says when the crawled pages stated no jurisdiction', () => {
    const text = render({ ...HELSINKI, jurisdiction: null, quote: undefined }).textContent ?? '';
    expect(text).toContain('did not state a jurisdiction');
  });

  it('lists the rules on request', () => {
    const el = render(undefined);
    expect(el.querySelector('.gate-rules')).toBeNull();
    el.querySelector<HTMLButtonElement>('.gate-links button')!.click();
    TestBed.tick();
    expect(el.querySelector('.gate-rules')?.textContent).toContain('Be nice');
  });
});
