import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Status } from '../models';
import { PostingCalendar } from './posting-calendar';

describe('PostingCalendar', () => {
  it('uses original publication dates for boosts, matching the surrounding feed analytics', () => {
    const fixture = TestBed.createComponent(PostingCalendar);
    fixture.componentRef.setInput('posts', [
      {
        created_at: '2026-01-18T12:00:00',
        reblog: { created_at: '2026-01-04T12:00:00' },
      } as Status,
      { created_at: '2026-01-18T12:00:00' } as Status,
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.day')).toHaveLength(21);
    expect(fixture.nativeElement.querySelectorAll('.heat-0')).toHaveLength(19);
  });
  it('shows quiet days between sparse posts and updates with the loaded sample', () => {
    const fixture = TestBed.createComponent(PostingCalendar);
    fixture.componentRef.setInput('posts', [
      { created_at: '2026-01-04T12:00:00' } as Status,
      { created_at: '2026-01-18T12:00:00' } as Status,
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.day')).toHaveLength(21);
    expect(element.querySelectorAll('.heat-0')).toHaveLength(19);
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('2 posts');
    fixture.componentRef.setInput('posts', []);
    fixture.detectChanges();
    expect(element.querySelector('.calendar')).toBeNull();
  });
});
