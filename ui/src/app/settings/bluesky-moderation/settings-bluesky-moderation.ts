import { Component, inject, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BulkWordsDialog } from '../../moderation/bulk-words-dialog/bulk-words-dialog';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MbNotice } from '../../design-system/notice/notice';
import { MbPageHeader, MbSection } from '../../design-system/page-header/page-header';
import { MbSaveFeedback } from '../../design-system/save-feedback/save-feedback';
import {
  BlueskyModeration,
  BskyLabelerEntry,
  BskyModerationList,
  mutedWordKey,
} from '../../connections/bluesky/bluesky-moderation';
import {
  BlueskyModerationState,
  BskyMutedWord,
} from '../../connections/bluesky/bluesky-moderation-state';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BlueskyChatApi } from '../../connections/bluesky/bluesky-chat-api';
import { BskyAllowIncoming } from '../../connections/bluesky/bluesky-types';
import { firstValueFrom } from 'rxjs';

// i18n settings.bskyModeration.title: Bluesky moderation
// i18n settings.bskyModeration.intro: Muted words, moderation lists and moderation services for your Bluesky account. They are saved to Bluesky, so bsky.app and other Bluesky apps use the same settings.
// i18n settings.bskyModeration.notLinked: No Bluesky account is linked
// i18n settings.bskyModeration.notLinkedHint: Link Bluesky to manage its moderation settings.
// i18n settings.bskyModeration.linkBluesky: Link Bluesky
// i18n settings.bskyModeration.loading: Loading Bluesky moderation settings…
// i18n settings.bskyModeration.failed: Couldn't load these settings from Bluesky.
// i18n settings.bskyModeration.retry: Retry
// i18n settings.bskyModeration.remove: Remove
// i18n settings.bskyModeration.words.title: Muted words and tags
// i18n settings.bskyModeration.words.hint: Posts containing these are collapsed behind a notice you can open, as on bsky.app. Your own posts are never hidden.
// i18n settings.bskyModeration.words.value: Word, phrase or #tag
// i18n settings.bskyModeration.words.where: Where to look
// i18n settings.bskyModeration.words.everywhere: Text and tags
// i18n settings.bskyModeration.words.tagsOnly: Tags only
// i18n settings.bskyModeration.words.duration: For how long
// i18n settings.bskyModeration.words.forever: Until I remove it
// i18n settings.bskyModeration.words.day: 24 hours
// i18n settings.bskyModeration.words.week: 7 days
// i18n settings.bskyModeration.words.month: 30 days
// i18n settings.bskyModeration.words.excludeFollowing: Not from people I follow
// i18n settings.bskyModeration.words.add: Mute
// i18n settings.bskyModeration.words.empty: No muted words or tags.
// i18n settings.bskyModeration.words.tags: tags only
// i18n settings.bskyModeration.words.until: until {{date}}
// i18n settings.bskyModeration.words.notFollowing: not from people you follow
// i18n settings.bskyModeration.lists.title: Moderation lists
// i18n settings.bskyModeration.lists.hint: Subscribe to a list someone keeps on Bluesky to mute or block everyone on it. Paste the list's bsky.app address.
// i18n settings.bskyModeration.lists.address: List address
// i18n settings.bskyModeration.lists.placeholder: https://bsky.app/profile/…/lists/…
// i18n settings.bskyModeration.lists.as: Use it to
// i18n settings.bskyModeration.lists.mute: Mute everyone on it
// i18n settings.bskyModeration.lists.block: Block everyone on it
// i18n settings.bskyModeration.lists.add: Subscribe
// i18n settings.bskyModeration.lists.empty: No moderation lists.
// i18n settings.bskyModeration.lists.muteList: Mute list
// i18n settings.bskyModeration.lists.blockList: Block list
// i18n settings.bskyModeration.lists.by: by @{{handle}}
// i18n settings.bskyModeration.lists.unsubscribe: Unsubscribe
// i18n settings.bskyModeration.services.title: Moderation services
// i18n settings.bskyModeration.services.hint: Moderation services add labels to posts and accounts. Bluesky's own moderation always applies; add others by their handle. Labelled media stays covered in Mawkingbird.
// i18n settings.bskyModeration.services.handle: Service handle
// i18n settings.bskyModeration.services.add: Subscribe
// i18n settings.bskyModeration.services.empty: Only Bluesky's own moderation.
// i18n settings.bskyModeration.chat.title: Who can message you
// i18n settings.bskyModeration.chat.hint: Who may start a Bluesky chat with you. Messages from anyone else are not delivered. People you already chat with can keep writing. Saved to Bluesky, so bsky.app shows the same choice.
// i18n settings.bskyModeration.chat.label: Allow new messages from
// i18n settings.bskyModeration.chat.all: Everyone
// i18n settings.bskyModeration.chat.following: People I follow
// i18n settings.bskyModeration.chat.none: No one
// i18n settings.bskyModeration.chat.saved: Saved.
// i18n settings.bskyModeration.chat.loadFailed: Couldn't read this setting from Bluesky.
/**
 * Settings → Bluesky moderation.
 *
 * Mastodon's filters and mutes have their own pages; Bluesky's moderation is
 * shaped differently (muted words live in account preferences and are applied
 * by each client, lists are shared, labels come from subscribable services),
 * so it gets one page of its own, built from the same design-system parts.
 */
@Component({
  selector: 'app-settings-bluesky-moderation',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    BulkWordsDialog,
    RouterLink,
    TranslocoPipe,
    MbPageHeader,
    MbSection,
    MbField,
    MbControl,
    MbCheckbox,
    MbButton,
    MbNotice,
    MbContentState,
    MbContentLink,
    MbSaveFeedback,
  ],
  templateUrl: './settings-bluesky-moderation.html',
  styleUrl: './settings-bluesky-moderation.css',
})
export class SettingsBlueskyModeration implements OnInit {
  protected session = inject(BlueskySession);
  protected state = inject(BlueskyModerationState);
  private moderation = inject(BlueskyModeration);
  private chat = inject(BlueskyChatApi);
  private i18n = inject(TranslocoService);

  protected loading = signal(false);
  protected failed = signal(false);
  protected busy = signal(false);
  protected wordsError = signal('');
  protected listsError = signal('');
  protected servicesError = signal('');

  protected lists = signal<BskyModerationList[]>([]);
  protected services = signal<BskyLabelerEntry[]>([]);

  protected wordValue = signal('');
  protected wordWhere = signal<'everywhere' | 'tags'>('everywhere');
  protected wordDays = signal(0);
  protected wordExcludeFollowing = signal(false);
  protected bulkOpen = signal(false);
  protected readonly mutedWordKey = mutedWordKey;
  protected listAddress = signal('');
  protected listPurpose = signal<'mute' | 'block'>('mute');
  protected serviceHandle = signal('');
  /** null until read; a failed read leaves the select out and says so. */
  protected allowIncoming = signal<BskyAllowIncoming | null>(null);
  protected chatError = signal('');
  protected chatLoadFailed = signal(false);
  protected chatSaved = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (!this.session.linked()) return;
    this.loading.set(true);
    this.failed.set(false);
    try {
      await this.moderation.reload();
      const [lists, services] = await Promise.all([
        this.moderation.lists(),
        this.moderation.labelers(),
      ]);
      this.lists.set(lists);
      this.services.set(services);
      void this.loadAllowIncoming();
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** The form's rule (where, how long, who) applied to one word. */
  private mutedWord(value: string): BskyMutedWord {
    const days = this.wordDays();
    return {
      value,
      targets: this.wordWhere() === 'tags' ? ['tag'] : ['content', 'tag'],
      actorTarget: this.wordExcludeFollowing() ? 'exclude-following' : 'all',
      ...(days ? { expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() } : {}),
    };
  }

  protected async addWord(): Promise<void> {
    const value = this.wordValue().trim();
    if (!value) return;
    if (
      await this.run(() => this.moderation.addMutedWord(this.mutedWord(value)), this.wordsError)
    ) {
      this.wordValue.set('');
    }
  }

  /** A pasted list, one write, the same rule for every word. */
  protected async addWords(values: string[]): Promise<void> {
    const words = values.map((value) => this.mutedWord(value));
    if (await this.run(() => this.moderation.addMutedWords(words), this.wordsError)) {
      this.bulkOpen.set(false);
    }
  }

  protected removeWord(word: BskyMutedWord): void {
    void this.run(() => this.moderation.removeMutedWord(word.value), this.wordsError);
  }

  protected wordDetail(word: BskyMutedWord): string {
    return [
      !word.targets.includes('content')
        ? this.i18n.translate('settings.bskyModeration.words.tags')
        : '',
      word.expiresAt
        ? this.i18n.translate('settings.bskyModeration.words.until', {
            date: new Date(word.expiresAt).toLocaleDateString(),
          })
        : '',
      word.actorTarget === 'exclude-following'
        ? this.i18n.translate('settings.bskyModeration.words.notFollowing')
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  protected async addList(): Promise<void> {
    const address = this.listAddress().trim();
    if (!address) return;
    const ok = await this.run(async () => {
      await this.moderation.subscribeList(address, this.listPurpose());
      this.lists.set(await this.moderation.lists());
    }, this.listsError);
    if (ok) this.listAddress.set('');
  }

  protected removeList(list: BskyModerationList): void {
    void this.run(async () => {
      await this.moderation.unsubscribeList(list);
      this.lists.update((lists) => lists.filter((l) => l !== list));
    }, this.listsError);
  }

  protected async addService(): Promise<void> {
    const handle = this.serviceHandle().trim();
    if (!handle) return;
    const ok = await this.run(async () => {
      await this.moderation.addLabeler(handle);
      this.services.set(await this.moderation.labelers());
    }, this.servicesError);
    if (ok) this.serviceHandle.set('');
  }

  protected removeService(service: BskyLabelerEntry): void {
    void this.run(async () => {
      await this.moderation.removeLabeler(service.did);
      this.services.update((services) => services.filter((s) => s.did !== service.did));
    }, this.servicesError);
  }

  /** Read apart from the rest, so a chat-scope problem never hides moderation. */
  private async loadAllowIncoming(): Promise<void> {
    this.chatLoadFailed.set(false);
    try {
      this.allowIncoming.set(await firstValueFrom(this.chat.getAllowIncoming()));
    } catch {
      this.chatLoadFailed.set(true);
    }
  }

  /** Saved on change; on failure the select goes back to what Bluesky has. */
  protected async setAllowIncoming(value: BskyAllowIncoming): Promise<void> {
    const previous = this.allowIncoming();
    this.allowIncoming.set(value);
    this.chatSaved.set(false);
    const ok = await this.run(
      () => firstValueFrom(this.chat.setAllowIncoming(value)).then(() => undefined),
      this.chatError,
    );
    if (ok) {
      this.chatSaved.set(true);
    } else {
      this.allowIncoming.set(previous);
    }
  }

  /** One change at a time; a failure shows Bluesky's reason in that section. */
  private async run(
    change: () => Promise<void>,
    error: ReturnType<typeof signal<string>>,
  ): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    error.set('');
    try {
      await change();
      return true;
    } catch (failure: unknown) {
      error.set(failure instanceof Error && failure.message ? failure.message : String(failure));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
