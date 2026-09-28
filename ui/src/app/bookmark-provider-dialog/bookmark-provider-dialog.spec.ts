import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { BookmarkProviderDialog } from './bookmark-provider-dialog';

describe('BookmarkProviderDialog shared shell', () => {
  function render() {
    const f = TestBed.createComponent(BookmarkProviderDialog);
    f.detectChanges();
    return f;
  }
  it('retains all three choice payloads, including unwrapping the external link', () => {
    const f = render();
    f.componentRef.setInput('externalUrl', 'https://very-long.example/article');
    f.detectChanges();
    const chosen = vi.fn();
    f.componentInstance.chosen.subscribe(chosen);
    const choices = Array.from(
      (f.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.provider-choice'),
    );
    expect(choices).toHaveLength(3);
    choices.forEach((button) => button.click());
    expect(chosen.mock.calls).toEqual([['mastodon'], ['raindrop-post'], ['raindrop-link']]);
    expect(f.nativeElement.textContent).toContain('very-long.example');
  });
  it('preserves anonymous removal wording and omits only an unavailable unwrap choice', () => {
    const f = render();
    f.componentRef.setInput('anonymous', true);
    f.componentRef.setInput('nativeBookmarked', true);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('This browser');
    expect(f.nativeElement.textContent).toContain('Remove the native bookmark');
    expect(f.nativeElement.textContent).toContain('No external link was found');
    expect((f.nativeElement as HTMLElement).querySelectorAll('.provider-choice')).toHaveLength(2);
  });
  it('closing does not select a bookmark destination', () => {
    const f = render();
    const closed = vi.fn(),
      chosen = vi.fn();
    f.componentInstance.closed.subscribe(closed);
    f.componentInstance.chosen.subscribe(chosen);
    const close = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Close',
    )!;
    close.click();
    expect(closed).toHaveBeenCalledOnce();
    expect(chosen).not.toHaveBeenCalled();
  });
});
