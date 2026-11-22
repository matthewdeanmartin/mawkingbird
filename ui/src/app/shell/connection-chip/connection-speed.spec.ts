import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectionSummary } from '../../observability/connection/connection-summary';
import { ConnectionMeter } from '../../platform/network/connection-meter';
import { ConnectionSample } from '../../platform/network/connection-quality';
import { ConnectionSpeed } from './connection-speed';

describe('connection speed readouts', () => {
  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ConnectionSpeed, ConnectionSummary],
      providers: [provideHttpClient(), provideRouter([])],
    });
    await TestBed.compileComponents();
  });

  afterEach(() => localStorage.clear());

  function record(outcome: ConnectionSample['outcome'], ms: number, count: number): void {
    const meter = TestBed.inject(ConnectionMeter);
    const now = Date.now();
    for (let i = count; i > 0; i--) {
      meter.record({ at: now - i, ms, outcome, latency: true, home: true });
    }
  }

  function text(): string {
    const fixture = TestBed.createComponent(ConnectionSpeed);
    fixture.detectChanges();
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  it('shows nothing in the menu before anything is measured', () => {
    expect(text()).toBe('');
  });

  it('shows the typical reply time in the menu', () => {
    record('ok', 240, 4);
    expect(text()).toBe('240 ms');
  });

  it('says Offline in the menu when nothing gets through', () => {
    record('unreachable', 50, 3);
    expect(text()).toBe('Offline');
  });

  it('summarizes the last hour on the Observability card and links to the detail', () => {
    record('ok', 1800, 4);
    const fixture = TestBed.createComponent(ConnectionSummary);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/connection');
    const body = el.textContent!.replace(/\s+/g, ' ');
    expect(body).toContain('Slow, but getting through');
    expect(body).toContain('Typical reply 1.8 s');
    expect(body).toContain('Last hour: 4 requests, 0% with no answer');
  });
});
