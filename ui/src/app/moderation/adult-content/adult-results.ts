import { computed, signal } from '@angular/core';
import { Account, Status } from '../../platform/api/models';
import { AdultFilter, ClientPrefs } from '../../platform/storage/client-prefs';
import { AdultVerdict, classifyAccount, classifyAuthors, classifyResult } from './adult-classifier';

interface PersonLike {
  account: Account;
  matchingPosts?: readonly Status[];
}

/**
 * The adult filter over one page of loaded results (spec/moderation-facets.md §3),
 * shared by every result list that offers it (Mastodon search, the Bluesky
 * panel; later the Directory).
 *
 * Construct it in an injection context's field initializer, passing readers
 * for the loaded posts and people. Nothing here fetches: verdicts use only
 * what is loaded, which is why a person's verdict improves as more of their
 * posts load.
 */
export class AdultResults {
  /** Show all / hide / only, starting from the reader's remembered choice. */
  readonly filter = signal<AdultFilter>('either');
  /** Collapsed rows the reader chose to show, as "s:<id>" / "a:<id>". */
  readonly revealed = signal<ReadonlySet<string>>(new Set());

  constructor(
    private readonly prefs: ClientPrefs,
    private readonly posts: () => readonly Status[],
    private readonly people: () => readonly PersonLike[],
  ) {
    this.filter.set(prefs.adultFilter());
  }

  /** The reader chose: remembered for next time. */
  choose(value: AdultFilter): void {
    this.filter.set(value);
    this.prefs.adultFilter.set(value);
  }

  /** A link chose: this view only. */
  override(value: AdultFilter): void {
    this.filter.set(value);
  }

  /** One verdict per loaded post, judged with everything loaded from its author. */
  readonly postVerdicts = computed(() => {
    const statuses = this.posts();
    const authors = classifyAuthors(statuses);
    const out = new Map<string, AdultVerdict>();
    for (const s of statuses) {
      out.set(s.id, classifyResult(s, authors.get((s.reblog ?? s).account.id)));
    }
    return out;
  });

  /** One verdict per loaded person, from their profile and matched posts. */
  readonly accountVerdicts = computed(() => {
    const out = new Map<string, AdultVerdict>();
    for (const p of this.people()) {
      out.set(p.account.id, classifyAccount(p.account, p.matchingPosts ?? []));
    }
    return out;
  });

  isAdultPost(s: Status): boolean {
    return !!this.postVerdicts().get(s.id)?.adult;
  }

  isAdultAccount(id: string): boolean {
    return !!this.accountVerdicts().get(id)?.adult;
  }

  /** Apply Only to a list; Show all and Hide keep everything (Hide collapses rows). */
  keepPosts<T extends Status>(list: readonly T[]): T[] {
    return this.filter() === 'only' ? list.filter((s) => this.isAdultPost(s)) : [...list];
  }

  keepPeople<T extends PersonLike>(list: readonly T[]): T[] {
    return this.filter() === 'only'
      ? list.filter((p) => this.isAdultAccount(p.account.id))
      : [...list];
  }

  /** The verdict to collapse this post to, or null to render it normally. */
  collapsedPost(s: Status): AdultVerdict | null {
    const verdict = this.postVerdicts().get(s.id);
    return this.filter() === 'hide' && verdict?.adult && !this.revealed().has(`s:${s.id}`)
      ? verdict
      : null;
  }

  collapsedAccount(id: string): AdultVerdict | null {
    const verdict = this.accountVerdicts().get(id);
    return this.filter() === 'hide' && verdict?.adult && !this.revealed().has(`a:${id}`)
      ? verdict
      : null;
  }

  /**
   * The verdict to explain above a shown adult post: every kept post under
   * Only, and the ones a reader revealed under Hide. Not adult needs no why.
   */
  badgePost(s: Status): AdultVerdict | null {
    const verdict = this.postVerdicts().get(s.id);
    if (!verdict?.adult) return null;
    const filter = this.filter();
    return filter === 'only' || (filter === 'hide' && this.revealed().has(`s:${s.id}`))
      ? verdict
      : null;
  }

  badgeAccount(id: string): AdultVerdict | null {
    const verdict = this.accountVerdicts().get(id);
    if (!verdict?.adult) return null;
    const filter = this.filter();
    return filter === 'only' || (filter === 'hide' && this.revealed().has(`a:${id}`))
      ? verdict
      : null;
  }

  reveal(key: string): void {
    this.revealed.update((set) => new Set(set).add(key));
  }

  /** Loaded posts / people that Only left out for not being adult. */
  readonly droppedPosts = computed(() =>
    this.filter() === 'only' ? this.posts().filter((s) => !this.isAdultPost(s)).length : 0,
  );
  readonly droppedPeople = computed(() =>
    this.filter() === 'only'
      ? this.people().filter((p) => !this.isAdultAccount(p.account.id)).length
      : 0,
  );
}
