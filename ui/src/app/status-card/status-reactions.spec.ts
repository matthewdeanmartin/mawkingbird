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
    const chips = el.querySelectorAll('.reaction');
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
    expect(render(many).querySelectorAll('.reaction').length).toBe(16);
  });

  it('lets the reader react, remove their own, and not reuse another server’s emoji', () => {
    const fixture = TestBed.createComponent(StatusReactions);
    fixture.componentRef.setInput('reactions', [
      { name: '👍', key: '👍', count: 2, url: null, me: false },
      { name: ':mine:', key: ':mine:', count: 1, url: 'https://s/mine.webp', me: true },
      { name: ':remote:', count: 1, url: 'https://o/remote.webp', me: false },
    ]);
    fixture.componentRef.setInput('canReact', true);
    fixture.detectChanges();
    const sent: (string | null)[] = [];
    fixture.componentInstance.react.subscribe((r) => sent.push(r));
    const el = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(el.querySelectorAll('button.reaction')) as HTMLButtonElement[];
    // 👍, :mine:, and the + button; :remote: is plain text.
    expect(buttons.length).toBe(3);
    buttons[0].click();
    buttons[1].click();
    expect(sent).toEqual(['👍', null]);
    expect(el.querySelector('span.reaction')?.getAttribute('title')).toBe(':remote:');
  });

  it('renders plain chips when the reader cannot react', () => {
    const el = render([{ name: '👍', key: '👍', count: 2, url: null, me: false }]);
    expect(el.querySelector('button')).toBeNull();
  });
});
