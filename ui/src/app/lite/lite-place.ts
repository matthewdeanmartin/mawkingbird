import {
  DestroyRef,
  ElementRef,
  Signal,
  WritableSignal,
  afterNextRender,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { PagedState, applyIncoming } from './lite-store';

/**
 * Keeps the reader's place in a Lite list (spec/lite-next-hour.md, Sprint B).
 *
 * - Newer posts found by a refresh go straight on top only while the reader
 *   is at the top already; anywhere else they wait behind the "new posts"
 *   pill, so nothing shifts under the post being read.
 * - Leaving the screen records the first post in view; coming back scrolls to
 *   it, so Home → a thread → Home lands where the reader was.
 *
 * Items must carry `data-lite-item="<id>"`. Call from a constructor.
 */
export function keepPlace<T>(held: Signal<WritableSignal<PagedState<T>>>): {
  showIncoming: () => void;
} {
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const atTop = () => typeof window === 'undefined' || window.scrollY < TOP_SLACK_PX;

  effect(() => {
    const state = held();
    if (state().incoming.length && atTop()) {
      untracked(() => state.update(applyIncoming));
    }
  });

  afterNextRender(() => {
    const anchor = held()().anchorId;
    if (!anchor) return;
    const escaped = typeof CSS !== 'undefined' ? CSS.escape(anchor) : anchor;
    const element = host.querySelector(`[data-lite-item="${escaped}"]`);
    element?.scrollIntoView?.({ block: 'start' });
  });

  inject(DestroyRef).onDestroy(() => {
    const first = [...host.querySelectorAll<HTMLElement>('[data-lite-item]')].find(
      (element) => element.getBoundingClientRect().bottom > CHROME_PX,
    );
    const id = first?.dataset['liteItem'] ?? null;
    held().update((s) => ({ ...s, anchorId: id }));
  });

  return {
    showIncoming: () => {
      held().update(applyIncoming);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    },
  };
}

/** Within this many pixels of the top counts as "at the top". */
const TOP_SLACK_PX = 120;
/** Roughly Lite's sticky top bar; posts under it are not "in view". */
const CHROME_PX = 60;
