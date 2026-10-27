import { DestroyRef, inject, Signal, signal } from '@angular/core';
import { RailContent, RailOutlet } from '../../rail-outlet';
import { ForumFacets } from './forum-facets';
import { ForumMembers } from './forum-members';

export const FORUM_LEFT: RailContent = { component: ForumFacets, labelKey: 'forum.facets.rail' };
export const FORUM_RIGHT: RailContent = { component: ForumMembers, labelKey: 'forum.members.rail' };

/** Where the shell drops each rail (shell.css): right first, then left. */
const RIGHT_RAIL_GONE = '(max-width: 1240px)';
const LEFT_RAIL_GONE = '(max-width: 1000px)';

function matches(query: string, destroyRef: DestroyRef): Signal<boolean> {
  const list = typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
  const value = signal(list?.matches ?? false);
  if (list) {
    const update = (event: MediaQueryListEvent) => value.set(event.matches);
    list.addEventListener('change', update);
    destroyRef.onDestroy(() => list.removeEventListener('change', update));
  }
  return value.asReadonly();
}

/**
 * Put Forum's facets and members in the shell's rails for as long as the
 * calling page lives, and say which rails the window is too narrow to show,
 * so the page can offer their contents inline instead. Call from a
 * constructor.
 */
export function useForumRails(): { leftHidden: Signal<boolean>; rightHidden: Signal<boolean> } {
  const outlet = inject(RailOutlet);
  const destroyRef = inject(DestroyRef);
  const owner = {};
  outlet.show(owner, { left: FORUM_LEFT, right: FORUM_RIGHT });
  destroyRef.onDestroy(() => outlet.release(owner));
  return {
    leftHidden: matches(LEFT_RAIL_GONE, destroyRef),
    rightHidden: matches(RIGHT_RAIL_GONE, destroyRef),
  };
}
