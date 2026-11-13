import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ReadingBack } from './reading-back';
import { ReadingHistory } from './reading-history';

describe('shared reading Back control', () => {
  it('offers one labelled header action using the same history operation as browser Back', () => {
    const back = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: ReadingHistory, useValue: { back } }],
    });
    const fixture = TestBed.createComponent(ReadingBack);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.textContent).toContain('Back');
    expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe('←');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.hasAttribute('mbButton')).toBe(true);
    button.click();
    expect(back).toHaveBeenCalledOnce();
  });
});
