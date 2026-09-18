import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PollResults } from './poll-results';
import { Poll } from '../models';

const poll: Poll = {
  id: 'p',
  expires_at: null,
  expired: true,
  multiple: false,
  votes_count: 10,
  voters_count: 10,
  voted: false,
  own_votes: [1],
  options: [
    { title: 'A', votes_count: 4 },
    { title: 'B', votes_count: 6 },
  ],
};

describe('PollResults', () => {
  it('renders proportional bars and accessible interval text with own-vote styling', async () => {
    await TestBed.configureTestingModule({ imports: [PollResults] }).compileComponents();
    const fixture = TestBed.createComponent(PollResults);
    fixture.componentRef.setInput('poll', poll);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector<HTMLElement>('.poll-bar')!.style.width).toBe('40%');
    expect(element.querySelectorAll('.own')).toHaveLength(1);
    expect(element.querySelectorAll('.error-range')).toHaveLength(2);
    expect(element.textContent).toContain('16.8');
    fixture.componentRef.setInput('poll', { ...poll, multiple: true, voters_count: 8 });
    fixture.detectChanges();
    expect(element.querySelector<HTMLElement>('.poll-bar')!.style.width).toBe('50%');
  });
  it('does not expose counts or statistics before results are visible', async () => {
    await TestBed.configureTestingModule({ imports: [PollResults] }).compileComponents();
    const fixture = TestBed.createComponent(PollResults);
    fixture.componentRef.setInput('poll', poll);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.poll-bar')).toBeNull();
    expect(element.querySelector('.statistics')).toBeNull();
    expect(element.textContent).toContain('A');
  });
});
