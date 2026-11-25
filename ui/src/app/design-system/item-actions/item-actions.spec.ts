import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { MbItemAction, MbItemActions } from './item-actions';

describe('MbItemActions', () => {
  function mount(actions: MbItemAction[], iconsWhenNarrow = false) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MbItemActions);
    fixture.componentRef.setInput('label', 'Video actions');
    fixture.componentRef.setInput('actions', actions);
    fixture.componentRef.setInput('iconsWhenNarrow', iconsWhenNarrow);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('keeps links as links and buttons as buttons, in order, in one named group', () => {
    const run = vi.fn();
    const root = mount([
      { id: 'watch', icon: 'play', label: 'Watch', link: '/watch', queryParams: { youtube: 'x' } },
      { id: 'save', icon: 'save', label: 'Save', pressed: true, run },
      { id: 'open', icon: 'open', label: 'Open', href: 'https://example.com/' },
    ]);
    expect(root.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Video actions');
    const controls = [...root.querySelectorAll<HTMLElement>('a, button')];
    expect(controls.map((el) => [el.tagName, el.textContent?.trim()])).toEqual([
      ['A', 'Watch'],
      ['BUTTON', 'Save'],
      ['A', 'Open'],
    ]);
    expect(controls[0].getAttribute('href')).toBe('/watch?youtube=x');
    expect(controls[1].getAttribute('aria-pressed')).toBe('true');
    expect(controls[2].getAttribute('rel')).toBe('noopener noreferrer');
    controls[1].click();
    expect(run).toHaveBeenCalledOnce();
  });

  it('reports pressed only for toggles', () => {
    const root = mount([{ id: 'share', icon: 'share', label: 'Share', run: () => undefined }]);
    expect(root.querySelector('button')?.hasAttribute('aria-pressed')).toBe(false);
  });

  it('keeps the name, and adds it as a tooltip, where narrow rows show icons', () => {
    const root = mount([{ id: 'share', icon: 'share', label: 'Share' }], true);
    const button = root.querySelector('button')!;
    expect(button.textContent?.trim()).toBe('Share');
    expect(button.title).toBe('Share');
    expect(root.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
