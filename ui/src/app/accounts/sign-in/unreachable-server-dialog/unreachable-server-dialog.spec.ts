import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnreachableServerDialog } from './unreachable-server-dialog';

describe('UnreachableServerDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    // The discovery panel inside probes real hosts on mount. Nothing here tests
    // the hunt itself (server-discovery.spec covers it), so refuse everything.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    TestBed.configureTestingModule({});
  });

  function render(server = 'https://mastodon.social') {
    const fixture = TestBed.createComponent(UnreachableServerDialog);
    fixture.componentRef.setInput('attemptedServer', server);
    fixture.detectChanges();
    return fixture;
  }

  it('names the host that failed, so the message is about something concrete', () => {
    const text = (render().nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('mastodon.social');
    expect(text).toContain('isn’t reachable');
  });

  it('starts the hunt on mount rather than behind a button', () => {
    const el = render().nativeElement as HTMLElement;

    // Auto-start is the point: the visitor is on an error path they did not
    // choose, so they should not have to opt in to fixing it.
    expect(el.textContent).toContain('Looking for an available server');
  });

  it('mounts the shared discovery component rather than a private copy', () => {
    expect(
      (render().nativeElement as HTMLElement).querySelector('app-server-discovery'),
    ).not.toBeNull();
  });

  it('offers a way out that does not depend on finding a server', () => {
    const fixture = render();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    const skip = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Skip'),
    ) as HTMLButtonElement;
    skip.click();

    expect(cancelled).toHaveBeenCalled();
  });

  // Nothing sits behind this dialog: it appears because there is no reachable
  // server, so an accidental Escape would land on the fail whale it prevents.
  it('cannot be dismissed by pressing Escape', () => {
    const fixture = render();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(cancelled).not.toHaveBeenCalled();
  });

  it('falls back to a readable label when the attempted server is not a URL', () => {
    expect((render('').nativeElement as HTMLElement).textContent).toContain('That server');
  });
});
