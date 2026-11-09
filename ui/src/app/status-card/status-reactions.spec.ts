import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StatusReaction } from '../models';
import { StatusReactions } from './status-reactions';

function render(reactions: StatusReaction[]): HTMLElement {
  const fixture = TestBed.createComponent(StatusReactions);
  fixture.componentRef.setInput('reactions', reactions);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('StatusReactions', () => {
  it('shows Unicode and custom reactions with counts, marking the reader own', () => {
    const el = render([
      { name: ':blobcat:', count: 5, url: 'https://misskey.io/emoji/blobcat.webp', me: true },
      { name: '👍', count: 2, url: null, me: false },
    ]);
    const chips = el.querySelectorAll('li.reaction');
    expect(chips.length).toBe(2);
    expect(chips[0].classList.contains('mine')).toBe(true);
    expect(chips[0].querySelector('img')?.getAttribute('alt')).toBe(':blobcat:');
    expect(chips[0].textContent).toContain('5');
    expect(chips[1].querySelector('img')).toBeNull();
    expect(chips[1].textContent).toContain('👍');
  });

  it('caps the number of chips shown', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `:e${i}:`,
      count: 1,
      url: null,
      me: false,
    }));
    expect(render(many).querySelectorAll('li.reaction').length).toBe(16);
  });
});
