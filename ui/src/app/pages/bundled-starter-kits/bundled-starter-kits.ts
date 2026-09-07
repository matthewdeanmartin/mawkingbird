import { Component, computed, inject, signal } from '@angular/core';
import { StarterPackTextPipe } from '../../starter-pack-text';
import { RouterLink } from '@angular/router';
import { STARTER_KITS, STARTER_CATALOG_UPDATED_AT, starterKitText } from '../../starter-collection';
import { SHIPPED_STARTER_KITS } from '../../starter-kits';
import { KnownLanguages } from '../../trend-language-filter';
import { UiLocale } from '../../i18n/locale';

// i18n bundledStarterKits.languages: Pack languages
// i18n bundledStarterKits.myLanguages: My languages
// i18n bundledStarterKits.allLanguages: All languages
// i18n bundledStarterKits.updated: Catalogue updated {{date}}
// i18n bundledStarterKits.languageNote: Browse any language here. This does not change the languages in your settings. Older sets with no language label are also shown.

// i18n bundledStarterKits.title: People to follow
// i18n bundledStarterKits.intro: Each of these is a ready-made set of accounts. Open one to see who is in it, sample what they post, and follow the whole set in one go — or pick through it.
// i18n bundledStarterKits.account.one: {{count}} account
// i18n bundledStarterKits.account.other: {{count}} accounts
// i18n bundledStarterKits.open: · open →
// i18n bundledStarterKits.filter.label: Filter these
// i18n bundledStarterKits.filter.placeholder: photography, science, news…
// i18n bundledStarterKits.filter.none: Nothing here matches “{{query}}”. Clear the filter to see every set.
// i18n bundledStarterKits.byUs: Ours
// i18n bundledStarterKits.byThem: Curated by {{curator}}
// i18n bundledStarterKits.moreWays: Looking for something more specific?
// i18n bundledStarterKits.moreWaysLink: Every way to find people

/** One curated set, whichever corpus it came from. */
interface DiscoverySet {
  key: string;
  title: string;
  blurb: string;
  accountCount: number;
  link: string;
  /** Who assembled it: us, or the person whose collection this snapshots. */
  curator: string | null;
  lang?: string;
}

/**
 * The one page that answers "who should I follow?".
 *
 * ## Why two kinds of thing share a page
 *
 * The app ships two corpora, and they really are different: **starter kits**
 * are assembled by this app's developer, **bundled collections** are snapshots
 * of real collections other people published on their own instances. That
 * distinction is true, and it used to be the *first* thing a newcomer was asked
 * to understand — two routes, reached through two rows on the Find Friends hub,
 * each explaining its own provenance before showing a single face.
 *
 * It is our distinction, not theirs. Someone who has just been told their
 * timeline is empty wants people; "was this list assembled by the developer or
 * snapshotted from someone else's instance" is a question they have no basis to
 * answer and no reason to care about. So both kinds are listed together, and
 * provenance survives as a quiet label on each card rather than as a fork in
 * the road.
 *
 * The routes are untouched — `/bundled-collections` still exists and still
 * works, so every link that ever pointed at it keeps working.
 *
 * ## Who this page is for
 *
 * Newcomers. First-run sends an anonymous visitor straight here (see
 * `Shell.answerFirstRun`), because this is the shortest path in the app from
 * nothing to a working timeline: one press follows a whole set. The Find
 * Friends hub is the other audience — someone who already has a timeline and
 * wants *more* people, tags, imports and directories — and it stays exactly as
 * it is, linked from the foot of this page for anyone who needs it.
 */
@Component({
  selector: 'app-bundled-starter-kits',
  imports: [RouterLink, StarterPackTextPipe],
  templateUrl: './bundled-starter-kits.html',
  styleUrl: './bundled-starter-kits.css',
})
export class BundledStarterKits {
  private readonly known = inject(KnownLanguages);
  private readonly locale = inject(UiLocale);
  protected readonly language = signal('known');
  protected readonly copyLanguage = computed(() =>
    ['known', 'all'].includes(this.language()) ? undefined : this.language(),
  );
  protected readonly updated = STARTER_CATALOG_UPDATED_AT.slice(0, 10);
  protected readonly languages = [
    ...new Set(STARTER_KITS.flatMap((kit) => (kit.lang ? [kit.lang] : []))),
  ]
    .map((code) => ({
      code,
      name: new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  /** Free-text narrowing, because the merged list is longer than either was. */
  protected readonly filter = signal('');

  private readonly all = computed<readonly DiscoverySet[]>(() => [
    ...STARTER_KITS.map((kit) => ({
      key: `kit:${kit.slug}`,
      ...starterKitText(kit, this.locale.active()),
      lang: kit.lang,
      accountCount: kit.accounts.length,
      link: kit.slug === 'starter' ? '/collections/starter' : `/collections/starter/${kit.slug}`,
      curator: null,
    })),
    ...SHIPPED_STARTER_KITS.map((collection) => ({
      key: `collection:${collection.id}`,
      title: collection.title,
      blurb: collection.description,
      accountCount: collection.accounts.length,
      link: `/collections/${collection.id}`,
      curator: collection.curatorName || collection.curatorHandle,
    })),
  ]);

  /**
   * The sets to show, narrowed by the filter box.
   *
   * Matches title and blurb, the same fields and the same plain substring rule
   * as the search page's `kitMatchesFor` — a reader who found a set by typing
   * "birds" into search should find it by typing "birds" here.
   */
  protected readonly visible = computed<readonly DiscoverySet[]>(() => {
    const needle = this.filter().trim().toLowerCase();
    const language = this.language();
    const sets = this.all().filter(
      (set) =>
        !set.lang ||
        language === 'all' ||
        (language === 'known' ? this.known.knows(set.lang) : set.lang === language),
    );
    return sets.filter(
      (set) =>
        set.title.toLowerCase().includes(needle) ||
        (set.blurb ?? '').toLowerCase().includes(needle),
    );
  });
}
