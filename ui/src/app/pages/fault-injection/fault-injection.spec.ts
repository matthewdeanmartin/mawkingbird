import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { FaultEffectType, FaultRule } from '../../models';
import { FaultInjection } from './fault-injection';

const sampleRule: FaultRule = {
  id: 'r1',
  match: { methods: ['GET'], path: '/api/v1/timelines/public', path_regex: null },
  effect: { type: 'status', status: 503, body: null, headers: {}, delay_ms: 0, truncate: true },
  remaining: null,
};

/** Exposes the component's protected signals/methods for white-box testing. */
interface FaultInjectionInternals {
  rules: Signal<FaultRule[]>;
  loading: Signal<boolean>;
  error: Signal<string | null>;
  method: WritableSignal<string>;
  path: WritableSignal<string>;
  effectType: WritableSignal<FaultEffectType>;
  status: WritableSignal<number>;
  count: WritableSignal<number | null>;
  adding: Signal<boolean>;
  addRule(): void;
  remove(id: string): void;
  clearAll(): void;
  needsStatus(): boolean;
  needsDelay(): boolean;
}

function internals(fixture: ComponentFixture<FaultInjection>): FaultInjectionInternals {
  return fixture.componentInstance as unknown as FaultInjectionInternals;
}

describe('FaultInjection', () => {
  let httpMock: HttpTestingController;

  function setUp() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(FaultInjection);
  }

  it('loads existing rules on init', () => {
    const fixture = setUp();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/_mock/faults');
    expect(req.request.method).toBe('GET');
    req.flush([sampleRule]);

    expect(internals(fixture).rules()).toEqual([sampleRule]);
    expect(internals(fixture).loading()).toBe(false);
  });

  it('addRule() omits empty match fields and posts the effect', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/faults').flush([]);

    const c = internals(fixture);
    c.method.set('post');
    c.path.set('/api/v1/statuses');
    c.effectType.set('status');
    c.status.set(429);
    c.addRule();

    const req = httpMock.expectOne('/api/v1/_mock/faults');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      match: { methods: ['POST'], path: '/api/v1/statuses' },
      effect: { type: 'status', status: 429, delay_ms: 0 },
    });
    req.flush({
      id: 'r2',
      match: { methods: ['POST'], path: '/api/v1/statuses', path_regex: null },
      effect: { type: 'status', status: 429, body: null, headers: {}, delay_ms: 0, truncate: true },
      remaining: null,
    });

    expect(c.rules().map((r) => r.id)).toEqual(['r2']);
    expect(c.adding()).toBe(false);
  });

  it('addRule() includes a fire count only when set', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/faults').flush([]);

    const c = internals(fixture);
    c.count.set(3);
    c.addRule();

    const req = httpMock.expectOne('/api/v1/_mock/faults');
    expect((req.request.body as { count?: number }).count).toBe(3);
    req.flush(sampleRule);
  });

  it('addRule() surfaces the server-provided error detail', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/faults').flush([]);

    internals(fixture).addRule();
    httpMock
      .expectOne('/api/v1/_mock/faults')
      .flush(
        { detail: "Unknown effect type 'bogus'" },
        { status: 422, statusText: 'Unprocessable' },
      );

    expect(internals(fixture).error()).toBe("Unknown effect type 'bogus'");
    expect(internals(fixture).adding()).toBe(false);
  });

  it('remove() deletes the rule and drops it from the local list', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/faults').flush([sampleRule]);

    internals(fixture).remove('r1');
    const req = httpMock.expectOne('/api/v1/_mock/faults/r1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ ok: true });

    expect(internals(fixture).rules()).toEqual([]);
  });

  it('clearAll() empties the local list', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/faults').flush([sampleRule]);

    internals(fixture).clearAll();
    const req = httpMock.expectOne('/api/v1/_mock/faults');
    expect(req.request.method).toBe('DELETE');
    req.flush({ ok: true });

    expect(internals(fixture).rules()).toEqual([]);
  });

  it('needsStatus() is true for status/ratelimit, false otherwise', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/faults').flush([]);

    const c = internals(fixture);
    c.effectType.set('status');
    expect(c.needsStatus()).toBe(true);
    c.effectType.set('ratelimit');
    expect(c.needsStatus()).toBe(true);
    c.effectType.set('latency');
    expect(c.needsStatus()).toBe(false);
    c.effectType.set('malformed');
    expect(c.needsStatus()).toBe(false);
  });

  it('needsDelay() is true for latency/timeout, false otherwise', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/faults').flush([]);

    const c = internals(fixture);
    c.effectType.set('latency');
    expect(c.needsDelay()).toBe(true);
    c.effectType.set('timeout');
    expect(c.needsDelay()).toBe(true);
    c.effectType.set('status');
    expect(c.needsDelay()).toBe(false);
  });
});
