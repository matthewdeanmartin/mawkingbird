import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AdminApi } from '../admin-api';
import { AdminMetrics, cohortRow } from './admin-metrics';

describe('cohortRow', () => {
  it('reads the cohort size and the rates after 1 day, 7 days and now', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      rate: [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55][i],
      value: i === 0 ? '20' : '0',
    }));
    expect(cohortRow({ period: '2026-11-01T00:00:00Z', frequency: 'day', data })).toEqual({
      period: '2026-11-01T00:00:00Z',
      size: '20',
      after1: 0.95,
      after7: 0.65,
      latest: 0.55,
    });
  });

  it('leaves later columns empty for a cohort from yesterday', () => {
    const row = cohortRow({
      period: '2026-11-10T00:00:00Z',
      frequency: 'day',
      data: [{ date: '2026-11-10', rate: 1, value: '3' }],
    });
    expect([row.after1, row.after7, row.latest]).toEqual([null, null, null]);
  });
});

describe('AdminMetrics', () => {
  it('shows breakdowns and a retention table, and survives a section it may not read', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AdminApi,
          useValue: {
            measures: () => of([]),
            dimensions: () =>
              of([
                {
                  key: 'languages',
                  data: [{ key: 'en', human_key: 'English', value: '120' }],
                },
              ]),
            retention: () => throwError(() => new Error('403')),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AdminMetrics);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Languages posted in');
    expect(text).toContain('English');
    expect(text).not.toContain('Retention');
  });
});
