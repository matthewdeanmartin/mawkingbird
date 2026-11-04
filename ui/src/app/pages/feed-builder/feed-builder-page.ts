import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbBadge } from '../../design-system/badge/badge';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbDisclosure } from '../../design-system/disclosure/disclosure';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { LanguageVersions } from '../focused-apps/language-versions';
import { FollowButton } from '../../follow-button/follow-button';
import type { FeedFollowActions } from './feed-builder-actions';
import { FeedPerson, FeedTag, shelves } from './feed-builder-data';
import { personAccount, profileLink } from './feed-builder-people';
import { FEED_BUILDER_HUB, FEED_BUILDER_PREVIEW } from './feed-builder-registry';
import { FeedPage } from './feed-builder-routes';
import { FeedSelection } from './feed-selection';
import { TagActivity } from './tag-activity';

/**
 * Where readers ask questions or ask to be removed: the project account, opened
 * in Mawkingbird (works signed out). Not the bare mastodon.social URL, which the
 * pages carry only as `rel="me"` identity metadata (check-seo-build.mjs).
 */
export const HELP_PATH = '/accounts/@mawkingbird@mastodon.social';

type TagState = 'idle' | 'busy' | 'following' | 'failed';

/**
 * A topic page ("starter kit" in public copy) in one language, and the Builder
 * tab of its mini-app: the pitch, the hashtags (with future tags for languages
 * whose own tags are still small), the people by shelf, the servers, how
 * people are chosen, and questions. Everything is prerendered except the live
 * tag activity.
 *
 * Signed in (the shell's twin, `inShell`), every hashtag and person gains a
 * checkbox, ticked by default, and a Follow button; "Follow selected" follows
 * the ticked ones in one go. Signed out, the page offers sign-in (which returns
 * here) and the preview. One component serves every topic and language.
 */
@Component({
  selector: 'app-feed-builder-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    MbBadge,
    MbButton,
    MbCheckbox,
    MbContentLink,
    MbDisclosure,
    FollowButton,
    LanguageVersions,
    TagActivity,
  ],
  templateUrl: './feed-builder-page.html',
  styleUrls: ['../features/features.css', '../features/follow.css', './feed-builder.css'],
})
export class FeedBuilderPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  protected readonly selection = inject(FeedSelection);

  /**
   * Following needs an account, so the follow services load only in the
   * signed-in twin, by dynamic import (`feed-builder-actions.ts`): the public
   * page is prerendered without a document and must not pull that graph in.
   * The per-person FollowButton is `@defer`red for the same reason.
   */
  protected readonly actions = signal<FeedFollowActions | null>(null);
  protected readonly peopleRunning = computed(() => !!this.actions()?.importer.running());

  protected readonly page = this.route.snapshot.data['page'] as FeedPage;
  /** Set on the signed-in twin, where the shell supplies header, nav and account menu. */
  protected readonly inShell = this.route.snapshot.data['inShell'] === true;
  protected readonly hub = `/${FEED_BUILDER_HUB}`;
  protected readonly root = `/${this.page.path}`;
  protected readonly previewLink = `/${this.page.path}/${FEED_BUILDER_PREVIEW}`;
  /** Sign-in comes back to this page (it is a mini-app root; see login-destination.ts). */
  protected readonly returnHere = { next: this.root };
  protected readonly helpPath = HELP_PATH;
  protected readonly chrome = this.page.chrome;
  protected readonly controls = this.page.controls;
  protected readonly copy = this.page.copy;
  protected readonly lang = this.page.lang;
  /** The selection key: one per topic and language. */
  protected readonly key = `${this.page.topic}.${this.page.lang}`;
  protected readonly tags = this.page.data.tags.filter((tag) => tag.kind === 'tag');
  protected readonly futureTags = this.page.data.tags.filter((tag) => tag.kind === 'future');
  protected readonly shelves = shelves(this.page.data.people);
  protected readonly servers = this.page.data.servers;
  protected readonly updated = new Date(this.page.data.generatedAt).toLocaleDateString(this.lang, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  private readonly allTags = this.page.data.tags.map((tag) => tag.name);
  private readonly allPeople = this.page.data.people.map((person) => person.acct);
  private readonly accounts = new Map(
    this.page.data.people.map((person) => [person.acct, personAccount(person)]),
  );

  /** Follow state per hashtag (lower case), from the server and from this page's clicks. */
  protected readonly tagStates = signal<Record<string, TagState>>({});
  protected readonly selectedTags = computed(() =>
    this.selection.selectedTags(this.key, this.allTags),
  );
  protected readonly selectedPeople = computed(() =>
    this.selection.selectedPeople(this.key, this.allPeople),
  );
  protected readonly tagsToFollow = computed(() =>
    this.selectedTags().filter((tag) => this.tagState(tag) !== 'following'),
  );
  protected readonly followingTags = signal(false);

  /** The importer's progress, while it holds this page's people. */
  protected readonly peopleProgress = computed(() => {
    const rows = this.actions()?.importer.rows() ?? [];
    if (!rows.length || !rows.every((row) => this.allPeople.includes(row.handle))) return null;
    const done = rows.filter((row) => row.status === 'followed').length;
    const failed = rows.filter((row) => row.status === 'failed' || row.status === 'not_found');
    return { done, total: rows.length, failed: failed.length };
  });

  async ngOnInit(): Promise<void> {
    if (!this.inShell) return;
    const { FeedFollowActions } = await import('./feed-builder-actions');
    const actions = new FeedFollowActions(this.injector);
    this.actions.set(actions);
    try {
      const followed = new Set((await actions.topics.followed()).map((tag) => tag.toLowerCase()));
      this.tagStates.set(
        Object.fromEntries(
          this.allTags
            .filter((tag) => followed.has(tag.toLowerCase()))
            .map((tag) => [tag.toLowerCase(), 'following' as const]),
        ),
      );
    } catch {
      // Unknown follow state: every tag offers Follow, which is harmless to repeat.
    }
  }

  protected tagState(tag: string): TagState {
    return this.tagStates()[tag.toLowerCase()] ?? 'idle';
  }

  /** An English tag on a page in another language says so. */
  protected foreign(tag: FeedTag): boolean {
    return this.lang !== 'en' && tag.lang !== this.lang;
  }

  protected youtubeUrl(person: FeedPerson): string {
    return `https://www.youtube.com/channel/${person.youtube?.channelId}`;
  }

  protected profile(person: FeedPerson): string {
    return profileLink(person);
  }

  protected account(person: FeedPerson) {
    return this.accounts.get(person.acct) ?? null;
  }

  /** Presence badges, without repeating the YouTube link shown beside them. */
  protected elsewhere(person: FeedPerson) {
    return person.elsewhere.filter((kind) => !(kind === 'youtube' && person.youtube));
  }

  protected setAllTags(on: boolean): void {
    this.selection.setAllTags(this.key, this.allTags, on);
  }

  protected setAllPeople(on: boolean): void {
    this.selection.setAllPeople(this.key, this.allPeople, on);
  }

  async followTag(tag: string): Promise<void> {
    const actions = this.actions();
    if (!actions) return;
    const key = tag.toLowerCase();
    this.tagStates.update((states) => ({ ...states, [key]: 'busy' }));
    try {
      await firstValueFrom(actions.api.followTag(tag));
      this.tagStates.update((states) => ({ ...states, [key]: 'following' }));
    } catch {
      this.tagStates.update((states) => ({ ...states, [key]: 'failed' }));
    }
  }

  /** Follow every ticked hashtag not followed yet, one at a time. */
  async followSelectedTags(): Promise<void> {
    if (this.followingTags()) return;
    this.followingTags.set(true);
    try {
      for (const tag of this.tagsToFollow()) await this.followTag(tag);
    } finally {
      this.followingTags.set(false);
    }
  }

  /**
   * Follow every ticked person, through the same importer the in-app starter
   * kits use. By handle, not by the exported id: the id is the person's home
   * server's, so each handle is resolved on the reader's own server first.
   * Rate limits are respected, and a large batch asks for confirmation.
   */
  async followSelectedPeople(): Promise<void> {
    const importer = this.actions()?.importer;
    if (!importer || importer.running()) return;
    importer.reset();
    importer.load(this.selectedPeople());
    await importer.start();
  }
}
