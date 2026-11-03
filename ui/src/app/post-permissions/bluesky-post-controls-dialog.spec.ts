import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BskyPostControlsValue } from '../providers/bluesky/bluesky-post-controls';
import { BlueskyPostControlsDialog } from './bluesky-post-controls-dialog';

interface Internals {
  mode: { set(value: 'everyone' | 'some' | 'nobody'): void };
  quotes: { set(value: boolean): void };
  toggle(rule: string, on: boolean): void;
}

/** Bluesky reply and quote limits: everyone, nobody, or some people by rule. */
describe('BlueskyPostControlsDialog', () => {
  function render(initial: BskyPostControlsValue) {
    const fixture = TestBed.createComponent(BlueskyPostControlsDialog);
    fixture.componentRef.setInput('initial', initial);
    fixture.detectChanges();
    const saved: BskyPostControlsValue[] = [];
    fixture.componentInstance.saved.subscribe((value) => saved.push(value));
    return { fixture, saved, internals: fixture.componentInstance as unknown as Internals };
  }

  it('saves the chosen rules and quote setting', () => {
    const { fixture, saved, internals } = render({ replies: 'everyone', quotes: true });
    internals.mode.set('some');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('My followers');
    internals.toggle('follower', true);
    internals.quotes.set(false);

    fixture.componentInstance.apply();

    expect(saved).toEqual([{ replies: ['mention', 'follower'], quotes: false, lists: undefined }]);
  });

  it('treats "only some people" with nobody ticked as nobody', () => {
    const { fixture, saved, internals } = render({ replies: ['mention'], quotes: true });
    internals.toggle('mention', false);

    fixture.componentInstance.apply();

    expect(saved[0].replies).toBe('nobody');
  });

  it('keeps a list-only limit when no rule is ticked', () => {
    const { fixture, saved } = render({ replies: [], quotes: true, lists: 1 });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 list(s)');

    fixture.componentInstance.apply();

    expect(saved[0]).toEqual({ replies: [], quotes: true, lists: 1 });
  });
});
