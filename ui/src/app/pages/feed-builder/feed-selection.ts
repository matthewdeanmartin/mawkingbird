import { Injectable, signal } from '@angular/core';

interface Exclusions {
  tags: readonly string[];
  people: readonly string[];
}

const NONE: Exclusions = { tags: [], people: [] };

/**
 * What the reader picked on a topic page, shared by its Builder and Preview
 * tabs. Everything starts ticked (owner, 2026-11-04), so only what was
 * unticked is kept, per page. In memory only: the selection is a few clicks,
 * and nothing about it needs to outlive the tab or reach storage.
 */
@Injectable({ providedIn: 'root' })
export class FeedSelection {
  private readonly excluded = signal<Readonly<Record<string, Exclusions>>>({});

  private get(page: string): Exclusions {
    return this.excluded()[page] ?? NONE;
  }

  private set(page: string, change: Partial<Exclusions>): void {
    this.excluded.update((all) => ({ ...all, [page]: { ...this.get(page), ...change } }));
  }

  tagOn(page: string, tag: string): boolean {
    return !this.get(page).tags.includes(tag.toLowerCase());
  }

  personOn(page: string, acct: string): boolean {
    return !this.get(page).people.includes(acct.toLowerCase());
  }

  setTag(page: string, tag: string, on: boolean): void {
    const key = tag.toLowerCase();
    const tags = this.get(page).tags.filter((t) => t !== key);
    this.set(page, { tags: on ? tags : [...tags, key] });
  }

  setPerson(page: string, acct: string, on: boolean): void {
    const key = acct.toLowerCase();
    const people = this.get(page).people.filter((a) => a !== key);
    this.set(page, { people: on ? people : [...people, key] });
  }

  setAllTags(page: string, tags: readonly string[], on: boolean): void {
    this.set(page, { tags: on ? [] : tags.map((t) => t.toLowerCase()) });
  }

  setAllPeople(page: string, accts: readonly string[], on: boolean): void {
    this.set(page, { people: on ? [] : accts.map((a) => a.toLowerCase()) });
  }

  selectedTags(page: string, tags: readonly string[]): string[] {
    return tags.filter((tag) => this.tagOn(page, tag));
  }

  selectedPeople(page: string, accts: readonly string[]): string[] {
    return accts.filter((acct) => this.personOn(page, acct));
  }
}
