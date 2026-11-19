import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MbButton } from '../../../design-system/button/button';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { STARTER_KITS, starterKitText } from '../../../discovery/starter-collection';
import { UiLocale } from '../../../i18n/locale';
import { Api } from '../../../platform/api/api';
import { Auth } from '../../../platform/session/auth';
import { ClientPrefs } from '../../../platform/storage/client-prefs';
import { ImportFollows } from '../../import-follows';
import { onSetupNext } from '../setup-state';

/** One person on offer, from a starter kit or the server's suggestions. */
export interface SetupPerson {
  handle: string;
  name: string;
  avatar: string;
}

export interface SetupInterest {
  id: string;
  title: string;
  people: SetupPerson[];
}

const SUGGESTED = 'server';
const LIVELY_HOME = 20;
const bare = (code: string) => code.toLowerCase().split(/[-_]/)[0];

/**
 * Interests for the languages someone reads, the biggest first: one per
 * starter kit in those languages (English when none match).
 */
export function interestsFor(languages: readonly string[], locale: string): SetupInterest[] {
  const wanted = new Set(languages.map(bare));
  const inLanguage = STARTER_KITS.filter((kit) => kit.lang && wanted.has(bare(kit.lang)));
  const kits = inLanguage.length ? inLanguage : STARTER_KITS.filter((kit) => kit.lang === 'en');
  return [...kits]
    .sort((a, b) => b.accounts.length - a.accounts.length)
    .map((kit) => ({
      id: kit.slug,
      title: starterKitText(kit, locale).title,
      people: kit.accounts.map((a) => ({
        handle: a.handle,
        name: a.name,
        avatar: a.account.avatar ?? '',
      })),
    }));
}

/**
 * Fill the Home feed: pick interests, see the people behind them, follow.
 * Finding people is the hard part of a new account, so this step hands them
 * over instead of a search box. Follows go through `ImportFollows`, the same
 * rate-limit-aware queue the starter kits use. A soft target, never required.
 */
@Component({
  selector: 'app-setup-follow',
  imports: [MbButton, MbCheckbox],
  templateUrl: './setup-follow.html',
  styleUrl: './setup-steps.css',
})
export class SetupFollow implements OnInit {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly prefs = inject(ClientPrefs);
  private readonly locale = inject(UiLocale);
  protected readonly importer = inject(ImportFollows);
  private readonly state = onSetupNext(() => this.state.absorb(['find-people']));

  private readonly suggested = signal<SetupInterest | null>(null);
  protected readonly interests = computed(() => {
    const kits = interestsFor(this.prefs.knownLanguages(), this.locale.active());
    const server = this.suggested();
    return server?.people.length ? [server, ...kits] : kits;
  });
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());
  /** Handles the person unticked; everyone else in a chosen interest is followed. */
  protected readonly skipped = signal<ReadonlySet<string>>(new Set());

  protected readonly people = computed(() => {
    const own = this.auth.account()?.acct;
    const seen = new Set<string>();
    const out: SetupPerson[] = [];
    for (const interest of this.interests()) {
      if (!this.chosen().has(interest.id)) continue;
      for (const person of interest.people) {
        if (person.handle === own || seen.has(person.handle)) continue;
        seen.add(person.handle);
        out.push(person);
      }
    }
    return out;
  });
  protected readonly toFollow = computed(() =>
    this.people().filter((p) => !this.skipped().has(p.handle) && this.status(p.handle) === 'new'),
  );
  protected readonly followed = computed(
    () =>
      (this.auth.account()?.following_count ?? 0) +
      this.importer.rows().filter((row) => row.status === 'followed').length,
  );
  protected readonly lively = LIVELY_HOME;

  ngOnInit(): void {
    this.importer.reset();
    this.api.followSuggestions(20).subscribe({
      next: (list) =>
        this.suggested.set({
          id: SUGGESTED,
          title: 'Popular on your server',
          people: list.map((s) => ({
            handle: s.account.acct,
            name: s.account.display_name || s.account.username,
            avatar: s.account.avatar ?? '',
          })),
        }),
      error: () => this.suggested.set(null),
    });
  }

  protected toggleInterest(id: string, on: boolean): void {
    this.chosen.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected togglePerson(handle: string, on: boolean): void {
    this.skipped.update((set) => {
      const next = new Set(set);
      if (on) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }

  /** `new` until queued; then the queue's own status. */
  protected status(handle: string): string {
    return this.importer.rows().find((row) => row.handle === handle)?.status ?? 'new';
  }

  protected follow(): void {
    const handles = this.toFollow().map((p) => p.handle);
    if (!handles.length) return;
    // Append: the queue skips rows that are no longer pending, so earlier
    // follows keep their status on screen.
    this.importer.rows.update((rows) => [
      ...rows,
      ...handles.map((handle) => ({ handle, status: 'pending' as const })),
    ]);
    void this.importer.start();
  }
}
