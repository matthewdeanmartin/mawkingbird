import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbRadioGroup, RadioOption } from '../../design-system/radio-group/radio-group';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { SHARE_DESTINATIONS } from '../../posts/share-dialog/share-dialog';
import { intentIdsFor } from '../../posts/share-dialog/share-targets';
import { Compose } from '../../publishing/compose/compose';
import { Drafts } from '../../publishing/drafts';
import { TargetAvailabilitySource } from '../../publishing/compose/target-availability';
import { DELETE_BUDGET, PlaylistPublisher } from './playlist-publisher';
import { RadioDock } from './radio-dock';
import { RadioHeader } from './radio-header';
import { RadioPlayer, RadioTrack } from './radio-player';
import { RadioPlaylists } from './radio-playlists';
import { ShareRequest } from './share-request';
import {
  creditUrl,
  playlistText,
  ShareLink,
  shareLinks,
  shareTags,
  singleText,
} from './share-text';
import { TrackActions } from './track-actions';
import { countKey } from './count-key';

// i18n share.title: Share music
// i18n share.lead: Tell people about music you enjoy, wherever they are. Choose what goes in, then write the post.
// i18n share.nothing: Nothing to share yet
// i18n share.nothingHint: Choose Share on a single, a search result or a playlist.
// i18n share.singles: Saved singles
// i18n share.playlists: Playlists
// i18n share.include: What goes in
// i18n share.links: Where to listen
// i18n share.linksHint: Include every service, so each follower can open the one they use.
// i18n share.postLink: The Mastodon post
// i18n share.credit: Credit: {{credit}}
// i18n share.tags: Hashtags
// i18n share.format: How to post the playlist
// i18n share.format.post: One post with every track
// i18n share.format.postHint: Works everywhere, from any account.
// i18n share.format.thread: A Mastodon thread, one reply per track
// i18n share.format.threadHint: Each track gets its own reply, and the thread can be updated when the playlist changes.
// i18n share.preview: Preview
// i18n share.length: {{count}} characters
// i18n share.write: Write the post
// i18n share.rewrite: Start again from these choices
// i18n share.writeHint: The post opens in the composer: edit it, pick where it goes, and post.
// i18n share.posted: Shared.
// i18n share.elsewhere: Send it somewhere else
// i18n share.elsewhereHint: Opens that site with the post filled in.
// i18n share.trackCount.one: {{count}} track
// i18n share.trackCount.other: {{count}} tracks
// i18n share.signInThread: Sign in to a Mastodon account to post a thread.

/**
 * Share: telling followers about music someone else made, a recording or a
 * whole playlist. Not Studio (that is for showcasing your own uploads) and not
 * a bare text box: the choices here build the post, then the real composer
 * sends it anywhere the account can post, and intents reach the rest.
 */
@Component({
  selector: 'app-share-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbCheckbox,
    MbContentState,
    MbField,
    MbControl,
    MbRadioGroup,
    Compose,
    RadioHeader,
  ],
  templateUrl: './share-page.html',
  styleUrls: ['./radio-lists.css', './share-page.css'],
})
export class SharePage {
  readonly player = inject(RadioPlayer);
  readonly playlists = inject(RadioPlaylists);
  readonly publisher = inject(PlaylistPublisher);
  private readonly actions = inject(TrackActions);
  private readonly request = inject(ShareRequest);
  private readonly drafts = inject(Drafts);
  private readonly auth = inject(Auth);
  private readonly transloco = inject(TranslocoService);
  private readonly availability = inject(TargetAvailabilitySource);
  readonly deleteBudget = DELETE_BUDGET;
  readonly countKey = countKey;

  readonly playlistId = signal<string | null>(null);
  /** One recording to share, offered by the page the listener came from. */
  readonly track = signal<RadioTrack | null>(this.request.take());
  readonly playlist = computed(() => {
    const id = this.playlistId();
    return id ? (this.playlists.saved().find((row) => row.id === id) ?? null) : null;
  });

  readonly title = computed(() => {
    const row = this.playlist();
    if (row) return row.name;
    const track = this.track();
    return track ? this.player.title(track) : '';
  });
  readonly credit = computed(() => {
    const track = this.track();
    return track && !this.playlist() ? this.actions.credit(track) : '';
  });
  readonly links = computed<ShareLink[]>(() => {
    const track = this.track();
    return track && !this.playlist()
      ? shareLinks(track, this.transloco.translate('share.postLink'))
      : [];
  });
  readonly tagOptions = computed(() => {
    const row = this.playlist();
    const track = this.track();
    return shareTags(row ? row.tracks : track ? [track] : []);
  });

  /** Every link and the credit are in by default; #nowplaying is the one tag ticked. */
  readonly chosenLinks = linkedSignal(() => this.links().map((link) => link.url));
  readonly includeCredit = signal(true);
  readonly chosenTags = linkedSignal(() => (this.playlist() ? ['fedimusic'] : ['nowplaying']));
  readonly format = signal<'post' | 'thread'>('post');
  readonly visibility = signal('public');
  readonly formats = computed<RadioOption[]>(() => [
    {
      value: 'post',
      label: this.transloco.translate('share.format.post'),
      hint: this.transloco.translate('share.format.postHint'),
    },
    {
      value: 'thread',
      label: this.transloco.translate('share.format.thread'),
      hint: this.transloco.translate('share.format.threadHint'),
      disabled: !this.signedIn,
    },
  ]);

  /** The post (or the playlist's one post) these choices make. */
  readonly text = computed(() => {
    const row = this.playlist();
    if (row)
      return playlistText(
        row.name,
        row.description ?? '',
        row.tracks.flatMap((track) => {
          const url = creditUrl(track);
          return url ? [{ title: this.player.title(track), url }] : [];
        }),
        this.chosenTags(),
      );
    return singleText(this.title(), this.credit(), {
      credit: this.includeCredit(),
      links: this.chosenLinks(),
      tags: this.chosenTags(),
    });
  });
  readonly primaryUrl = computed(() => {
    const row = this.playlist();
    if (row) return row.published?.url ?? row.tracks.map(creditUrl).find(Boolean) ?? '';
    return this.chosenLinks()[0] ?? this.links()[0]?.url ?? '';
  });
  /** Sites without a connected account: their own share pages, filled in. */
  readonly intents = computed(() => {
    const ids = intentIdsFor(
      SHARE_DESTINATIONS.map((destination) => destination.id),
      this.availability.current(),
    );
    const context = { url: this.primaryUrl(), title: this.title(), text: this.text() };
    return SHARE_DESTINATIONS.filter((destination) => ids.includes(destination.id)).map(
      (destination) => ({
        id: destination.id,
        labelKey: destination.labelKey,
        href: destination.buildUrl(context),
      }),
    );
  });
  readonly plan = computed(() => {
    const row = this.playlist();
    return row ? this.publisher.plan(row) : null;
  });

  /** The composer is opened with the text as it stood; a new key reopens it with new choices. */
  readonly writing = signal(false);
  readonly composeKey = signal(0);
  readonly written = signal('');
  readonly posted = signal(false);
  readonly changed = computed(() => this.writing() && this.text() !== this.written());

  constructor() {
    this.player.installDock(RadioDock);
    effect(() => {
      this.auth.kind();
      this.auth.token();
      this.playlists.refresh();
    });
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => {
        this.playlistId.set(params.get('playlist'));
        this.writing.set(false);
        this.posted.set(false);
      });
  }

  get signedIn(): boolean {
    return !this.auth.isAnonymous && !this.auth.isForeignPrimary;
  }

  toggleLink(url: string, on: boolean): void {
    const order = this.links().map((link) => link.url);
    this.chosenLinks.update((links) =>
      order.filter((item) => (item === url ? on : links.includes(item))),
    );
  }

  toggleTag(tag: string, on: boolean): void {
    const order = this.tagOptions();
    this.chosenTags.update((tags) =>
      order.filter((item) => (item === tag ? on : tags.includes(item))),
    );
  }

  /** Park the text for the composer and open it; again after a change, it starts over. */
  write(): void {
    this.drafts.handoff({
      segments: [this.text()],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    this.written.set(this.text());
    this.posted.set(false);
    this.composeKey.update((key) => key + 1);
    this.writing.set(true);
  }

  onPosted(_status: Status): void {
    this.posted.set(true);
    this.writing.set(false);
  }

  async publishThread(): Promise<void> {
    const row = this.playlist();
    if (row) await this.publisher.publish(row.id, row.published?.visibility ?? this.visibility());
  }
}
