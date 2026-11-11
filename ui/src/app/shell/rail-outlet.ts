import { Injectable, signal, Type } from '@angular/core';

/** What a page puts in a rail: a lazy component and the rail's accessible name. */
export interface RailContent {
  component: Type<unknown>;
  /** Transloco key for the rail's `aria-label`. */
  labelKey: string;
}

/**
 * Lets a page replace the shell's default rails while it is shown (Forum's
 * facets and members, spec/forum.md). The shell holds only lazy component
 * references, as with {@link RadioOutlet}, so the replacement code stays in the
 * page's own chunk.
 *
 * Ownership is explicit because routes overlap: the next page is created
 * before the last one is destroyed, so a plain "clear on destroy" would wipe
 * rails the next page just claimed. Only the current owner can release.
 */
@Injectable({ providedIn: 'root' })
export class RailOutlet {
  readonly left = signal<RailContent | null>(null);
  readonly right = signal<RailContent | null>(null);
  private owner: object | null = null;

  show(owner: object, rails: { left?: RailContent; right?: RailContent }): void {
    this.owner = owner;
    this.left.set(rails.left ?? null);
    this.right.set(rails.right ?? null);
  }

  release(owner: object): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.left.set(null);
    this.right.set(null);
  }
}
