import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LanguageFinder } from './language-finder';

function setup() {
  const fixture = TestBed.createComponent(LanguageFinder);
  const picked: string[] = [];
  fixture.componentInstance.picked.subscribe((code) => picked.push(code));
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const type = (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const key = (k: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    fixture.detectChanges();
  };
  const options = () =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="option"]')) as HTMLElement[];
  return { fixture, input, type, key, options, picked };
}

describe('LanguageFinder', () => {
  it('shows nothing until the reader types', () => {
    const { options, input } = setup();
    expect(options()).toHaveLength(0);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('finds Malay by its own name and picks it with Enter', () => {
    const { type, key, options, picked, input } = setup();
    type('melayu');
    expect(options()[0].textContent).toContain('Malay');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0].id);
    key('Enter');
    expect(picked).toEqual(['ms']);
  });

  it('moves the active option with the arrow keys, wrapping around', () => {
    const { type, key, options } = setup();
    type('sami');
    const count = options().length;
    expect(count).toBeGreaterThan(1);
    key('ArrowDown');
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    key('ArrowUp');
    key('ArrowUp');
    expect(options()[count - 1].getAttribute('aria-selected')).toBe('true');
  });

  it('picks by click and never renders more than the limit', () => {
    const { fixture, type, options, picked } = setup();
    fixture.componentRef.setInput('limit', 3);
    type('a');
    expect(options().length).toBeLessThanOrEqual(3);
    options()[0].click();
    expect(picked).toHaveLength(1);
  });

  it('says when nothing matches', () => {
    const { fixture, type } = setup();
    type('zzzzqq');
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
  });
});
