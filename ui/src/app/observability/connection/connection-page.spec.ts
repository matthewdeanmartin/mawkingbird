import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectionMeter } from '../../platform/network/connection-meter';
import { ConnectionPage } from './connection-page';

describe('ConnectionPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ConnectionPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    await TestBed.compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('says there is not enough activity before anything is measured', () => {
    const fixture = TestBed.createComponent(ConnectionPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.verdict-title')!.textContent).toContain('Not enough activity');
    expect(el.querySelectorAll('svg.timeline g').length).toBe(60);
    expect(el.querySelectorAll('tbody tr').length).toBe(4);
  });

  it('describes an offline run and switches the timeline to a day', () => {
    const meter = TestBed.inject(ConnectionMeter);
    const now = Date.now();
    for (let i = 3; i > 0; i--) {
      meter.record({ at: now - i, ms: 50, outcome: 'unreachable', latency: true, home: true });
    }
    const fixture = TestBed.createComponent(ConnectionPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.verdict')!.getAttribute('data-verdict')).toBe('offline');
    expect(el.querySelector('.verdict-reason')!.textContent).toContain('nothing has come back');

    const day = [...el.querySelectorAll('mb-toolbar button')].find((b) =>
      b.textContent!.includes('24 hours'),
    ) as HTMLButtonElement;
    day.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('svg.timeline g').length).toBe(96);
  });
});
