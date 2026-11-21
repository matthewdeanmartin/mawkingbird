import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectionMeter } from '../../platform/network/connection-meter';
import { ConnectionChip } from './connection-chip';

describe('ConnectionChip', () => {
  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ConnectionChip],
      providers: [provideHttpClient(), provideRouter([])],
    });
    await TestBed.compileComponents();
  });

  afterEach(() => localStorage.clear());

  function recordMany(outcome: 'ok' | 'unreachable', count: number): void {
    const meter = TestBed.inject(ConnectionMeter);
    const now = Date.now();
    for (let i = count; i > 0; i--) {
      meter.record({ at: now - i, ms: 100, outcome, latency: true, home: true });
    }
  }

  it('stays hidden while the connection is fine', () => {
    recordMany('ok', 4);
    const fixture = TestBed.createComponent(ConnectionChip);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('a')).toBeNull();
  });

  it('links to the connection page when requests stop arriving', () => {
    recordMany('unreachable', 3);
    const fixture = TestBed.createComponent(ConnectionChip);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/connection');
    expect(link.textContent).toContain('Offline');
  });
});
