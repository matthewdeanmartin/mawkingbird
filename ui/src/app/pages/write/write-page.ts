import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { FocusTrap } from '../../a11y/focus-trap';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { ClientPrefs } from '../../client-prefs';
import { FeatureFlags } from '../../feature-flags';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { BloggerSession } from '../../providers/blogger/blogger-session';
import { HugoSettings } from '../../providers/hugo/hugo-settings';
import { MataroaSettings } from '../../providers/mataroa/mataroa-settings';
import { Draft, DraftMedia, DraftSnapshot, Drafts, draftHasContent } from '../../drafts';
import { HumanTimePipe } from '../../human-time.pipe';
import { MAX_POST_CHARS, PostTarget } from '../../compose/compose';
import {
  VISIBILITIES,
  visibilityHint,
  visibilityLabel,
  VisibilityState,
} from '../../compose/visibility-state';
import { altTextMessage, mediaTypeOf, undescribedIndexes } from '../../compose/alt-text';
import { LinkShortening } from '../../compose/link-shortening';
import { ProxyConsentDialog } from '../../providers/shortener/proxy-consent-dialog/proxy-consent-dialog';
import { EmojiPicker } from '../../emoji-picker/emoji-picker';
import { CustomEmojis } from '../../custom-emojis';
import { TagHelperDialog } from '../../compose/tag-helper-dialog/tag-helper-dialog';
import { TranslateDialog, TranslateResult } from '../../compose/translate-dialog/translate-dialog';
import { AiAvailability } from '../../ai-availability';
import { OpenRouterSession } from '../../providers/openrouter/openrouter-session';
import {
  Proofreader,
  ProofreadingFinding,
  ProofreadingRequestPreview,
} from '../../compose/proofreader';
import { KnownLanguages } from '../../trend-language-filter';
import { LANG_NAMES, LangCode } from '../../language-detect';
import { TargetAvailability, targetLabel, usableTargets } from '../../compose/post-targets';
import { applyMinimalMarkdown } from '../../markdown';
import { stripHtml } from '../../sentiment';
import {
  WizardStep,
  activeSteps,
  firstStep,
  forwardLabel,
  nextStep,
  previousStep,
  stepPosition,
  stepTitleKey,
} from '../../publish-wizard';
import { runQualityChecks } from './quality-checks';
import { WriteBoard } from './board/write-board';
import { WritingZen } from '../../writing-zen';
import { PkmItem, PkmSource } from '../../pkm/pkm-source';
import { PKM_KINDS, PkmKind, pkmLabel, pkmNounKey, withPkmTag } from '../../pkm/pkm-tags';
import { DraftItem, DraftKind, toSnapshot } from '../drafts/draft-items';
import { DraftSources } from '../drafts/draft-sources';
import {
  SPLIT_MODES,
  SplitMode,
  insertSplitAt,
  isObviousSingleton,
  segmentsFor,
  bodyToBoxes,
  boxesToBody,
  splitModeHint,
  splitModeLabel,
  splitModeNoun,
  splitText,
} from './split-modes';
import { WriteWorkspace } from './write-workspace';
import { BlueskyPublication, blueskyThreadError } from './bluesky-publication';
import { Terminology } from '../../terminology';

type DraftFilter = 'all' | DraftKind;

interface FilterChip {
  id: DraftFilter;
  key: string;
}

/**
 * What the editor is currently holding.
 *
 * `key` is the workspace-sidecar key, which exists for every kind. `localId` is
 * set only when the editor can save *back* to something — that is true for a
 * local draft, and becomes true for any other kind the moment its copy is saved.
 * Everything else is a copy in progress with no home yet, which is exactly the
 * rule /drafts already follows: a local draft is continued in place, and every
 * other kind hands over a copy while the original stays where it is.
 */
interface Editing {
  key: string;
  localId: string | null;
  /** The kind this text came from, for the "copied from" line. */
  origin: DraftKind | null;
  /** Translation key for the editor-head title. */
  titleKey: string;
  savedAt: string | null;
}

/** A pending navigation held up by unsaved work. */
interface PendingSwitch {
  run: () => void;
}

/** A transient status line: a translation key plus its interpolation params. */
export interface Notice {
  key: string;
  params?: Record<string, unknown>;
}

// i18n pages.write.aria.write: Write
// i18n pages.write.heading: Write
// i18n pages.write.aria.writingSurfaces: Writing surfaces
// i18n pages.write.tab.editor: Editor
// i18n pages.write.tab.notes: Notes & to-dos
// i18n pages.write.boardButton: ▦ Board
// i18n pages.write.toggleDrafts: Drafts
// i18n pages.write.toggleNotes: Notes
// i18n pages.write.allDrafts: All drafts →
// i18n pages.write.pageNote: Drafts, editor and notes, side by side. Nothing else.
// i18n pages.write.aria.drafts: Drafts
// i18n pages.write.newDraftButton: New
// i18n pages.write.publishedHere: Published to Bluesky.
// i18n pages.write.aria.filterDraftsByKind: Filter drafts by kind
// i18n pages.write.loadingDrafts: Loading drafts…
// i18n pages.write.noDraftsOfKind: No drafts of that kind.
// i18n pages.write.noDraftsYet: Nothing in progress yet. Hit <strong>New</strong> and start writing.
// i18n pages.write.title.localOnly: Saved in this browser only
// i18n pages.write.badge.local: 💾 local
// i18n pages.write.badge.parked: ⏳ parked
// i18n pages.write.badge.self: 🔒 self
// i18n pages.write.title.pasteService: Published to a paste service
// i18n pages.write.badge.paste: 📋 paste
// i18n pages.write.aria.editor: Editor
// i18n pages.write.savedAt: saved
// i18n pages.write.copyUntouched: a copy — the original is untouched
// i18n pages.write.notSavedYet: not saved yet
// i18n pages.write.title.unsavedChanges: Unsaved changes
// i18n pages.write.splitLabel: Split
// i18n pages.write.aria.contentWarning: Content warning
// i18n pages.write.placeholder.cw: Content warning or blog title
// i18n pages.write.aria.postsInThread: Posts in this thread
// i18n pages.write.boxAriaLabel: Post {{index}} of {{total}}
// i18n pages.write.placeholder.writeFirst: Write.
// i18n pages.write.placeholder.writeNext: And then…
// i18n pages.write.removePostAriaLabel: Remove post {{index}}
// i18n pages.write.addPostButton: + Add {{noun}}
// i18n pages.write.aria.attachedMedia: Attached media
// i18n pages.write.placeholder.describeMedia: Describe this media
// i18n pages.write.aria.poll: Poll
// i18n pages.write.addChoice: + Add choice
// i18n pages.write.allowMultiple: Allow multiple
// i18n pages.write.aria.pollDuration: Poll duration
// i18n pages.write.aria.writingTools: Writing tools
// i18n pages.write.title.attachMediaHint: Attach media — or paste an image into the writing box
// i18n pages.write.attachMedia: Attach media
// i18n pages.write.addPoll: Add poll
// i18n pages.write.contentWarning: Content warning
// i18n pages.write.cwShort: CW
// i18n pages.write.markSensitive: Mark attached media sensitive
// i18n pages.write.insertEmoji: Insert emoji
// i18n pages.write.suggestHashtags: Suggest hashtags
// i18n pages.write.translateWriting: Translate writing
// i18n pages.write.aria.whoCanSee: Who can see this
// i18n pages.write.languageNotSpecified: 🌐 Not specified
// i18n pages.write.linkCost.one: That link counts as {{chars}} characters, however long it is — you have room.
// i18n pages.write.linkCost.other: Those links count as {{chars}} characters, however long they are — you have room.
// i18n pages.write.shorteningHelps.one: Shortening only makes it easier to read.
// i18n pages.write.shorteningHelps.other: Shortening only makes them easier to read.
// i18n pages.write.shortening: Shortening…
// i18n pages.write.shortenWith: Shorten with {{name}}
// i18n pages.write.setUpShortener: Set up a shortener
// i18n pages.write.aria.writingFeedback: Writing feedback
// i18n pages.write.advisoryOnly: All advisory — none of this stops you publishing.
// i18n pages.write.askingOpenRouter: Asking OpenRouter…
// i18n pages.write.proofreadAgain: 🤖 Proofread again
// i18n pages.write.proofreadWithAi: 🤖 Proofread with AI
// i18n pages.write.sendsTextTo: Sends your text to {{connector}} and may use paid credits.
// i18n pages.write.connectorLabel: Connector:
// i18n pages.write.modelLabel: Model:
// i18n pages.write.exactPromptLabel: Exact prompt that will be sent:
// i18n pages.write.sendToOpenRouter: Send to OpenRouter
// i18n pages.write.cancel: Cancel
// i18n pages.write.askingModel: OpenRouter is asking the selected model for diagnostic notes…
// i18n pages.write.noDiagnosticNotes: The model returned no diagnostic notes.
// i18n pages.write.aiUnavailable: AI proofreader unavailable:
// i18n pages.write.aria.enterZen: Enter zen mode, hiding everything but the text
// i18n pages.write.zenModeButton: Zen mode
// i18n pages.write.splitHere: Split here
// i18n pages.write.describeAttachmentsFirst: Describe every attachment first.
// i18n pages.write.clear: Clear
// i18n pages.write.scheduleSingleTarget: Scheduling applies to a single Mastodon {{post}}.
// i18n pages.write.saveDraft: Save draft
// i18n pages.write.publish: Publish →
// i18n pages.write.aria.clearScheduled: Clear the scheduled time and publish now
// i18n pages.write.aria.splitPreview: Split preview
// i18n pages.write.aria.notesAndTodos: Notes and to-dos
// i18n pages.write.tagsLink: Tags…
// i18n pages.write.jotANote: Jot a note
// i18n pages.write.placeholder.jot: Jot something down…
// i18n pages.write.kindLabel: Kind
// i18n pages.write.saveButton: Save
// i18n pages.write.aria.filterNotesByKind: Filter notes by kind
// i18n pages.write.allChip: All
// i18n pages.write.loadingNotes: Loading notes…
// i18n pages.write.nothingOfThatKind: Nothing of that kind.
// i18n pages.write.pkmEmptySide: Tag anything <code>#NOTE</code> or <code>#TODO</code> and it shows up here — as a draft, or as a post only you can see.
// i18n pages.write.pkmEmptyTab.lead: Tag anything <code>#NOTE</code> or <code>#TODO</code> and it lands here.
// i18n pages.write.pkmEmptyTab.defs: A <strong>note</strong> is something you wrote down to keep. A <strong>to-do</strong> is something you owe a reply to. Either can be a draft in this browser, or a post only you can see.
// i18n pages.write.changeTheseWords: Change these words…
// i18n pages.write.badge.draft: 💾 draft
// i18n pages.write.badge.privatePost: 🔒 private post
// i18n pages.write.unsavedTitle: You have unsaved writing
// i18n pages.write.unsavedMessage.media: Attachments remain only in this open editor. Publish or remove them before switching, or discard everything. Discarding cannot be undone.
// i18n pages.write.unsavedMessage.plain: Save it as a local draft before moving on, or discard it. Discarding cannot be undone.
// i18n pages.write.discard: Discard
// i18n pages.write.saveAndContinue: Save and continue
// i18n pages.write.wizardStep: Step {{position}} of {{total}}
// i18n pages.write.aria.publishTo: Publish to
// i18n pages.write.scheduleAvailable: Mastodon can hold this post server-side. You can choose a publishing time next.
// i18n pages.write.scheduleUnavailable: This publishes now. Scheduling is offered only for a single Mastodon post; Mawkingbird does not rely on a browser or phone staying open.
// i18n pages.write.noTargets.before: Nothing is connected that this could be published to. Link a service under
// i18n pages.write.noTargets.after: , or sign in.
// i18n pages.write.connections: Connections
// i18n pages.write.noFindings: The built-in checks found nothing worth mentioning.
// i18n pages.write.proofreadElsewhere: Proofreading happens in the editor, where you can still change the text. Close this and use 🤖 Proofread with AI beside your writing.
// i18n pages.write.publishAt: Publish at
// i18n pages.write.holdsUntilPublish: The server holds it and publishes it then. It appears under Parked in your drafts until it does.
// i18n pages.write.emptyPublishesNow: Leave this empty to publish to Mastodon now.
// i18n pages.write.back: Back
// i18n pages.write.aria.draftBoard: Draft board
// i18n pages.write.pickADraft: Pick a draft on the left, or start a new one.
// i18n pages.write.newDraftEmptyState: New draft
// i18n pages.write.leaveZenMode: Leave zen mode
// i18n pages.write.saveDraft: Save draft
// i18n pages.write.segmentCount.one: {{count}} {{noun}}
// i18n pages.write.segmentCount.other: {{count}} {{noun}}
// i18n pages.write.tooLongCount.one: {{count}} too long
// i18n pages.write.tooLongCount.other: {{count}} too long
// i18n pages.write.overLimitCount.one: {{count}} over the limit
// i18n pages.write.overLimitCount.other: {{count}} over the limit
// i18n pages.write.showingRendered: Showing rendered
// i18n pages.write.showingRaw: Showing raw
// i18n pages.write.splitSummary.one: {{count}} {{noun}}, split by {{mode}}.
// i18n pages.write.splitSummary.other: {{count}} {{noun}}, split by {{mode}}.
// i18n pages.write.overLimitRefuse.one: {{count}} over the limit — the server will refuse it.
// i18n pages.write.overLimitRefuse.other: {{count}} over the limit — the server will refuse them.
// i18n pages.write.publishing: Publishing…
/**
 * The writing workspace.
 *
 * Mockingbird's reading surfaces are deliberately distracting, and that is the
 * deal: while you read, the rails offer trending tags and people to follow.
 * A writing surface owes you the opposite kind of distraction — your own drafts,
 * your own notes, the split preview of the thread you are about to post. Same
 * architecture, inverted content.
 *
 * So `/write` goes rails-off wide (like /search and /settings) and spends the
 * width on three panes: drafts, the editor, and notes. And when even those are
 * too much, writing zen turns off everything — see {@link WritingZen} for why
 * that is a different feature from the global zen preference.
 */
@Component({
  selector: 'app-write-page',
  imports: [
    FocusTrap,
    FormsModule,
    HumanTimePipe,
    RouterLink,
    WriteBoard,
    EmojiPicker,
    TagHelperDialog,
    TranslateDialog,
    ProxyConsentDialog,
    TranslocoPipe,
  ],
  templateUrl: './write-page.html',
  styleUrls: ['./write-workspace.css', './write-editor.css', './write-overlays.css'],
  providers: [VisibilityState, LinkShortening, BlueskyPublication],
})
export class WritePage implements OnInit, OnDestroy {
  private blueskyPublication = inject(BlueskyPublication);
  protected publishedHere = signal(false);
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;
  private transloco = inject(TranslocoService);

  protected sources = inject(DraftSources);
  protected pkm = inject(PkmSource);
  protected workspace = inject(WriteWorkspace);
  protected zen = inject(WritingZen);
  protected auth = inject(Auth);
  private drafts = inject(Drafts).forCurrentAccount();
  protected prefs = inject(ClientPrefs);
  private api = inject(Api);
  private featureFlags = inject(FeatureFlags);
  private bskySession = inject(BlueskySession);
  private mataroa = inject(MataroaSettings);
  private blogger = inject(BloggerSession);
  private hugo = inject(HugoSettings);
  private customEmojis = inject(CustomEmojis);
  private ai = inject(AiAvailability);
  private openrouter = inject(OpenRouterSession);
  private proofreader = inject(Proofreader);
  private knownLanguages = inject(KnownLanguages);

  /**
   * What is linked, flagged on and signed in — the same snapshot the composer
   * builds, read by the same rules in `post-targets.ts`. The wizard must never
   * offer a destination the composer would then refuse.
   */
  private availability(): TargetAvailability {
    return {
      anonymous: this.auth.isAnonymous,
      bskyLinked: this.bskySession.linked(),
      mataroaConnected: this.mataroa.connected(),
      bloggerReady: this.blogger.ready(),
      hugoConnected: this.hugo.connected(),
      pastebinEnabled: this.featureFlags.enabled('pastebin'),
      mataroaEnabled: this.featureFlags.enabled('connector-mataroa'),
      bloggerEnabled: this.featureFlags.enabled('connector-blogger'),
      hugoEnabled: this.featureFlags.enabled('connector-hugo'),
    };
  }
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private readonly editorBox = viewChild<ElementRef<HTMLTextAreaElement>>('editorBox');
  private readonly zenEditorBox = viewChild<ElementRef<HTMLTextAreaElement>>('zenEditorBox');
  private readonly zenButton = viewChild<ElementRef<HTMLButtonElement>>('zenButton');

  /** The editor body. One textarea; segmentation is computed, never typed into. */
  protected body = signal('');

  /**
   * Visibility, shared with the compact composer rather than re-derived.
   *
   * The writing page used to have no visibility control at all: every snapshot
   * was stamped with the account default and `applyFeatureSnapshot` dropped the
   * saved value, so a followers-only draft opened here came back public. It has
   * the room for a real picker, so it gets one.
   */
  private visibilityState = inject(VisibilityState);

  /**
   * Link shortening, shared with the compact composer. The writing page is
   * where long reference links actually get pasted, so leaving this out was
   * the odder of the two omissions.
   */
  private linkShortening = inject(LinkShortening);
  protected shortenerReady = this.linkShortening.ready;
  protected shortenerName = this.linkShortening.name;
  protected shortening = this.linkShortening.busy;
  protected shortenError = this.linkShortening.error;
  protected shortenerConsentPrompt = this.linkShortening.consentPrompt;
  protected visibility = this.visibilityState.value;
  protected readonly visibilities = VISIBILITIES;
  protected cwOpen = signal(false);
  protected spoilerText = signal('');
  protected sensitive = signal(false);
  protected media = signal<DraftMedia[]>([]);
  protected uploading = signal(false);
  protected mediaNotice = signal('');
  protected pollOpen = signal(false);
  protected pollOptions = signal<string[]>(['', '']);
  protected pollMultiple = signal(false);
  protected pollExpiresIn = signal(86400);
  protected readonly pollExpiry = [
    { label: '5 minutes', seconds: 300 },
    { label: '1 hour', seconds: 3600 },
    { label: '6 hours', seconds: 21600 },
    { label: '1 day', seconds: 86400 },
    { label: '3 days', seconds: 259200 },
    { label: '7 days', seconds: 604800 },
  ];
  protected emojiOpen = signal(false);
  private editorSelection: { start: number; end: number } | null = null;
  protected tagHelperOpen = signal(false);
  protected translateOpen = signal(false);
  protected postLanguage = signal('');
  protected readonly canUseAi = computed(() => this.ai.enabled() && this.openrouter.connected());
  protected readonly languageOptions = computed(() =>
    [...this.knownLanguages.codes()]
      .map((code) => ({ code, name: LANG_NAMES[code as LangCode] ?? code.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  protected aiFindings = signal<ProofreadingFinding[]>([]);
  protected aiProofreading = signal(false);
  protected aiProofreadComplete = signal(false);
  protected aiProofreadError = signal<string | null>(null);

  /**
   * Whether the consent panel — connector, model, and the exact prompt — is
   * expanded. Collapsed by default so the findings panel stays readable, but
   * always the step before anything is sent: the disclosure is the consent.
   */
  protected proofreadConsentOpen = signal(false);
  protected proofreadingRequest = computed<ProofreadingRequestPreview | null>(() =>
    this.canUseAi() ? this.proofreader.preview(this.body()) : null,
  );
  private proofreadGeneration = 0;
  private mediaTransferred = false;
  protected editing = signal<Editing | null>(null);
  /** True once the body differs from what was last saved. */
  protected dirty = signal(false);
  protected notice = signal<Notice | null>(null);
  protected saveError = signal<string | null>(null);
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  protected filter = signal<DraftFilter>('all');
  /** Whether the side panes are open on a narrow screen. */
  protected leftOpen = signal(false);
  protected rightOpen = signal(false);

  /**
   * Which surface the page is showing.
   *
   * The notes list gets a full-width tab as well as the narrow pane because the
   * to-do list is a *feed*: to-dos are meant to be "read this later" and "write
   * about this later", but somebody will absolutely put their shopping list in
   * there. That is not our business — but it does mean the list has a feed's
   * volume, and a 300px rail is not where you triage a feed.
   *
   * Deliberately a tab and not `/pkm`. That route is the front door of the
   * wider PKM epic (workflow, calendar, bookmarks, links), and claiming it now
   * with a thin version would mean either a shape that epic has to live with or
   * a URL that breaks under it.
   */
  protected tab = signal<'write' | 'notes'>('write');

  /**
   * Whether the board panel is open.
   *
   * A panel rather than a third tab, deliberately: tabs are for surfaces you go
   * to and stay in, and the board is one you glance at on the way back to
   * writing. It overlays rather than displacing the panes, so the editor
   * underneath is never torn down and an in-progress body always survives.
   */
  protected boardOpen = signal(false);

  protected openBoard(): void {
    this.boardOpen.set(true);
  }

  protected closeBoard(): void {
    this.boardOpen.set(false);
  }

  /** Pick a card: load it in the editor and get out of the way. */
  protected openFromBoard(item: DraftItem): void {
    this.boardOpen.set(false);
    this.tab.set('write');
    this.open(item);
  }

  /** A switch held up by unsaved work, released or discarded by the dialog. */
  protected pendingSwitch = signal<PendingSwitch | null>(null);

  // i18n pages.write.chips.all: All
  // i18n pages.write.chips.local: 💾 Local
  // i18n pages.write.chips.scheduled: ⏳ Parked
  // i18n pages.write.chips.self: 🔒 Self
  // i18n pages.write.chips.paste: 📋 Paste
  protected readonly chips: FilterChip[] = [
    { id: 'all', key: 'pages.write.chips.all' },
    { id: 'local', key: 'pages.write.chips.local' },
    { id: 'scheduled', key: 'pages.write.chips.scheduled' },
    { id: 'self', key: 'pages.write.chips.self' },
    { id: 'paste', key: 'pages.write.chips.paste' },
  ];

  protected readonly splitModes = SPLIT_MODES;
  protected readonly modeLabel = splitModeLabel;
  protected readonly modeHint = splitModeHint;
  protected readonly modeNoun = splitModeNoun;

  // ----------------------------------------------------------------- the notes
  //
  // The virtuous distraction. A reading surface offers trending tags and people
  // to follow; a writing surface offers the user their own material.

  protected readonly pkmKindList = PKM_KINDS;
  protected readonly pkmNounKey = pkmNounKey;
  /** Null is the "All" chip. */
  protected pkmFilter = signal<PkmKind | null>(null);
  /** The one-line jot box at the top of the notes pane. */
  protected jotText = signal('');
  protected jotKind = signal<PkmKind>('note');

  protected pkmVisible = computed(() => this.pkm.byKind(this.pkmFilter()));

  /** The chip label, in the user's own configured word. */
  protected pkmChipLabel(kind: PkmKind): string {
    return pkmLabel(kind, this.prefs.pkmVocabulary());
  }

  /** A kind with no configured words is switched off and gets no chip. */
  protected pkmKindEnabled(kind: PkmKind): boolean {
    return this.prefs.pkmVocabulary()[kind].length > 0;
  }

  protected setPkmFilter(kind: PkmKind | null): void {
    this.pkmFilter.set(kind);
  }

  protected pkmCount(kind: PkmKind | null): number {
    return kind ? this.pkm.counts()[kind] : this.pkm.items().length;
  }

  /**
   * Open a note in the editor, under exactly the rule the drafts pane follows:
   * a local one continues in place, a self-post hands over a copy.
   *
   * Routed through the same `guard` and the same editing state rather than a
   * parallel path, so there is one answer to "what happens to my unsaved work".
   */
  protected openNote(item: PkmItem): void {
    this.guard(() => {
      if (item.source.kind === 'local') {
        this.openLocal(item.source.draft);
        return;
      }
      this.body.set(stripHtml(item.source.status.content));
      this.editing.set({
        key: item.key,
        localId: null,
        origin: 'self',
        titleKey: 'pages.write.editing.copyOfPrivateNote',
        savedAt: null,
      });
      this.dirty.set(false);
      this.focusEditor();
    });
  }

  /**
   * Jot a note without leaving the draft you are writing.
   *
   * Saves a *new* local draft and deliberately touches nothing else — not the
   * body, not `editing()`, not the dirty flag. Writing down a stray thought
   * must not cost you the piece you are in the middle of, and must not trip the
   * unsaved-work guard on the way.
   */
  protected jot(): void {
    const text = this.jotText().trim();
    if (!text) {
      return;
    }
    const kind = this.jotKind();
    const outcome = this.drafts.save({
      segments: [withPkmTag(text, kind, this.prefs.pkmVocabulary())],
      spoilerText: '',
      sensitive: false,
      visibility: this.prefs.defaultVisibility(),
      poll: null,
      target: 'fedi',
    });
    if (!outcome.durable) {
      this.saveError.set(
        'This note could not be saved in your browser. Your writing is still here.',
      );
      return;
    }
    const id = outcome.id;
    // A jot is one line. Opening it later under the `---` default would invite
    // a stray dash to split a two-word note into two posts.
    this.workspace.setSplitMode(`local:${id}`, 'demand');
    this.jotText.set('');
    this.flash({
      key: 'pages.write.saved.jotted',
      params: { noun: this.transloco.translate<string>(pkmNounKey(kind)) },
    });
  }

  protected visible = computed(() => {
    const filter = this.filter();
    const items = this.sources.items();
    return filter === 'all' ? items : items.filter((item) => item.kind === filter);
  });

  /** The split mode for whatever is open, defaulting for an unsaved new draft. */
  protected splitMode = computed<SplitMode>(() => {
    const current = this.editing();
    return current ? this.workspace.splitMode(current.key) : 'rule';
  });

  /** The live segment preview beside the editor — the first virtuous distraction. */
  protected segments = computed(() =>
    segmentsFor(this.body(), this.splitMode(), { limit: MAX_POST_CHARS }),
  );

  /** True while the editor shows one box per post rather than one prose box. */
  protected boxed = computed(() => this.splitMode() === 'boxes');

  /**
   * Whether the preview strip renders markdown or shows the raw text.
   *
   * Raw is the default because the strip's main job is showing *where the
   * splits fall*, and rendering can disguise a stray `---` or a mis-split list.
   */
  protected renderedPreview = signal(false);

  /**
   * The body as editable boxes.
   *
   * Derived from the same stored string the `---` mode edits, so switching
   * modes never rewrites the draft — see {@link SplitMode}. Empty boxes survive
   * here (you have to be able to type into one you just added) and are dropped
   * at publish time by the shared split.
   */
  protected boxes = computed(() => bodyToBoxes(this.body()));

  protected setBoxText(index: number, value: string): void {
    const next = [...this.boxes()];
    if (index < 0 || index >= next.length) {
      return;
    }
    next[index] = value;
    this.body.set(boxesToBody(next));
    this.dirty.set(true);
    this.resetProofreading();
  }

  protected addBox(): void {
    this.body.set(boxesToBody([...this.boxes(), '']));
    this.dirty.set(true);
  }

  protected removeBox(index: number): void {
    const next = this.boxes().filter((_, at) => at !== index);
    this.body.set(boxesToBody(next.length ? next : ['']));
    this.dirty.set(true);
    this.resetProofreading();
  }

  protected overLimitCount = computed(() => this.segments().filter((s) => s.overLimit).length);

  protected hasContent = computed(() => this.body().trim() !== '');

  constructor() {
    // Prune sidecar entries for drafts that are gone. Runs off the live list
    // rather than on a timer: nothing else can tell the workspace a draft was
    // deleted, and the sources signal is the only thing that knows.
    effect(() => {
      if (this.sources.loaded()) {
        this.workspace.prune(this.sources.items().map((item) => item.key));
      }
    });
  }

  ngOnInit(): void {
    this.sources.load();
    this.pkm.load();
    const draftId = this.route.snapshot.queryParamMap.get('draft');
    if (draftId) {
      const draft = this.drafts.get(draftId);
      if (draft) {
        this.openLocal(draft);
      }
    }
  }

  ngOnDestroy(): void {
    // A zen session must never leak into another route: the exit control only
    // exists on this page, so leaving while it is on would hide the entire
    // interface with no way back.
    this.zen.exit();
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
    }
    if (!this.mediaTransferred) {
      for (const item of this.media()) {
        releaseDraftMedia(item);
      }
    }
  }

  // ------------------------------------------------------------------ editing

  protected onBodyInput(value: string): void {
    this.body.set(value);
    this.dirty.set(true);
    this.resetProofreading();
  }

  protected setSpoilerText(value: string): void {
    this.spoilerText.set(value);
    this.dirty.set(true);
  }

  protected toggleCw(): void {
    this.cwOpen.update((open) => !open);
    if (!this.cwOpen()) {
      this.spoilerText.set('');
    }
    this.dirty.set(true);
  }

  protected toggleSensitive(): void {
    this.sensitive.update((value) => !value);
    this.dirty.set(true);
  }

  protected togglePoll(): void {
    if (this.media().length) {
      return;
    }
    this.pollOpen.update((open) => !open);
    if (!this.pollOpen()) {
      this.pollOptions.set(['', '']);
      this.pollMultiple.set(false);
    }
    this.dirty.set(true);
  }

  /** Attachments still lacking a description, by index. Shared rule, see alt-text.ts. */
  protected undescribedMedia = computed(() => undescribedIndexes(this.media()));

  /**
   * The advisory line about missing descriptions, shown in the editor whether
   * or not the user opted into the hard requirement. The writing page has room
   * to say this where the writing happens, rather than only at the gate.
   */
  protected altTextNote = computed(() =>
    altTextMessage(this.undescribedMedia(), this.prefs.requireAltText()),
  );

  /** Whether missing descriptions should block publishing — only on request. */
  protected altTextMissing = computed(
    () => this.prefs.requireAltText() && this.undescribedMedia().length > 0,
  );

  /** The links long enough to be worth shortening, for the button's label. */
  protected longLinks = computed(() => this.linkShortening.longLinks(this.body()));

  protected async shortenLinks(): Promise<void> {
    const shortened = await this.linkShortening.shorten(this.body());
    if (shortened !== null) {
      this.body.set(shortened);
      this.dirty.set(true);
      this.resetProofreading();
    }
  }

  protected async acceptShortenerConsent(): Promise<void> {
    if (this.linkShortening.acceptConsent()) {
      await this.shortenLinks();
    }
  }

  protected declineShortenerConsent(): void {
    this.linkShortening.declineConsent();
  }

  protected setVisibility(value: string): void {
    if (this.visibilityLockReason()) {
      return;
    }
    this.visibilityState.choose(value);
    this.dirty.set(true);
  }

  /**
   * Why the picker is disabled, or null when it is live.
   *
   * Blog and paste destinations publish a document at a URL: "followers only"
   * has no meaning there, and offering a control that silently does nothing is
   * worse than saying so. The choice itself is not thrown away — it is stashed
   * and comes back when the destination does.
   */
  // i18n pages.write.visibilityLock.blog: A blog post is public at its URL.
  // i18n pages.write.visibilityLock.paste: A paste is reachable by anyone with the link.
  protected visibilityLockReason = computed(() => {
    switch (this.wizardTarget()) {
      case 'blog':
      case 'blogger':
      case 'hugo':
        return 'pages.write.visibilityLock.blog';
      case 'paste':
        return 'pages.write.visibilityLock.paste';
      default:
        return null;
    }
  });

  protected visibilityIcon(value: string): string {
    switch (value) {
      case 'public':
        return '🌐';
      case 'unlisted':
        return '🔉';
      case 'private':
        return '🔒';
      default:
        return '✉️';
    }
  }

  protected readonly visibilityLabel = visibilityLabel;
  protected readonly visibilityHint = visibilityHint;

  protected setPollOption(index: number, value: string): void {
    this.pollOptions.update((options) =>
      options.map((option, at) => (at === index ? value : option)),
    );
    this.dirty.set(true);
  }

  protected addPollOption(): void {
    if (this.pollOptions().length < 4) {
      this.pollOptions.update((options) => [...options, '']);
      this.dirty.set(true);
    }
  }

  protected removePollOption(index: number): void {
    if (this.pollOptions().length > 2) {
      this.pollOptions.update((options) => options.filter((_, at) => at !== index));
      this.dirty.set(true);
    }
  }

  protected setPollMultiple(value: boolean): void {
    this.pollMultiple.set(value);
    this.dirty.set(true);
  }

  protected setPollExpiry(value: number): void {
    this.pollExpiresIn.set(value);
    this.dirty.set(true);
  }

  protected toggleEmoji(): void {
    this.emojiOpen.update((open) => !open);
    if (this.emojiOpen()) {
      this.customEmojis.ensureLoaded();
    }
  }

  protected insertEmoji(value: string): void {
    const box = this.editorBox()?.nativeElement;
    const start = this.editorSelection?.start ?? this.body().length;
    const end = this.editorSelection?.end ?? start;
    this.onBodyInput(this.body().slice(0, start) + value + this.body().slice(end));
    this.emojiOpen.set(false);
    if (box) {
      setTimeout(() => {
        const caret = start + value.length;
        box.focus();
        box.setSelectionRange(caret, caret);
      });
    }
  }

  protected rememberEditorSelection(event: Event): void {
    const box = event.target as HTMLTextAreaElement;
    this.editorSelection = {
      start: box.selectionStart ?? this.body().length,
      end: box.selectionEnd ?? this.body().length,
    };
  }

  protected useSuggestedTags(tags: string[]): void {
    this.tagHelperOpen.set(false);
    const current = this.body();
    const existing = new Set(
      (current.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase()),
    );
    const additions = tags
      .map((tag) => tag.replace(/^#/, '').trim())
      .filter((tag) => tag && !existing.has(tag.toLowerCase()))
      .map((tag) => `#${tag}`);
    if (additions.length) {
      const separator = !current.trim() || /\s$/.test(current) ? '' : ' ';
      this.onBodyInput(current + separator + additions.join(' '));
    }
  }

  protected useTranslation(result: TranslateResult): void {
    this.translateOpen.set(false);
    if (result.mode === 'replace') {
      this.prefs.addKnownLanguage(result.code);
      this.postLanguage.set(result.code);
      this.onBodyInput(result.text);
      return;
    }
    const current = this.body().trimEnd();
    this.onBodyInput(current ? `${current}\n\n${result.text}` : result.text);
  }

  protected setPostLanguage(code: string): void {
    this.postLanguage.set(code);
    this.dirty.set(true);
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []).filter(isAttachable);
    if (!files.length) {
      return;
    }
    event.preventDefault();
    this.addFiles(files);
  }

  private addFiles(files: File[]): void {
    if (this.pollOpen()) {
      this.mediaNotice.set('Remove the poll before attaching media.');
      return;
    }
    const accepted = files.filter(isAttachable);
    if (!accepted.length) {
      return;
    }
    this.media.update((items) => [...items, ...accepted.map(localDraftMedia)]);
    this.mediaNotice.set('');
    this.dirty.set(true);
  }

  protected setMediaDescription(index: number, description: string): void {
    this.media.update((items) =>
      items.map((item, at) => (at === index ? { ...item, description } : item)),
    );
    this.dirty.set(true);
  }

  protected removeMedia(index: number): void {
    this.media.update((items) => {
      const removed = items[index];
      if (removed) {
        releaseDraftMedia(removed);
      }
      return items.filter((_, at) => at !== index);
    });
    if (!this.media().length) {
      this.sensitive.set(false);
    }
    this.dirty.set(true);
  }

  protected count(id: DraftFilter): number {
    return id === 'all' ? this.sources.items().length : this.sources.counts()[id];
  }

  protected select(id: DraftFilter): void {
    this.filter.set(id);
  }

  protected setSplitMode(mode: SplitMode): void {
    const current = this.editing();
    if (current) {
      this.workspace.setSplitMode(current.key, mode);
    }
  }

  /** Insert a boundary at the caret, for split-on-demand. */
  protected splitHere(): void {
    const box = this.editorBox()?.nativeElement;
    if (!box) {
      return;
    }
    const result = insertSplitAt(this.body(), box.selectionStart ?? this.body().length);
    this.body.set(result.text);
    this.dirty.set(true);
    // Restore the caret after Angular writes the new value back into the box.
    setTimeout(() => {
      box.focus();
      box.setSelectionRange(result.caret, result.caret);
    });
  }

  /** Start a fresh draft, guarding whatever is open. */
  protected newDraft(): void {
    this.guard(() => {
      this.resetAuthoringState();
      this.body.set('');
      this.editing.set({
        key: `new:${Date.now()}`,
        localId: null,
        origin: null,
        titleKey: 'pages.write.editing.newDraft',
        savedAt: null,
      });
      this.dirty.set(false);
      this.focusEditor();
    });
  }

  /**
   * Load a row into the editor.
   *
   * The rule from the drafts epic holds and is not negotiable: a local draft is
   * continued in place, and every other kind hands over a *copy* while the
   * original stays exactly where it is. Converting must never be how you lose
   * the thing you converted.
   */
  protected open(item: DraftItem): void {
    this.guard(() => {
      if (item.source.kind === 'local') {
        this.openLocal(item.source.draft);
        return;
      }
      const snapshot = toSnapshot(item.source, this.prefs.defaultVisibility());
      this.resetAuthoringState();
      this.applyFeatureSnapshot(snapshot);
      this.body.set(joinSegments(snapshot.segments));
      this.editing.set({
        key: item.key,
        localId: null,
        origin: item.kind,
        titleKey: kindTitleKey(item.kind),
        savedAt: null,
      });
      this.dirty.set(false);
      this.focusEditor();
    });
  }

  private openLocal(draft: Draft): void {
    this.resetAuthoringState();
    this.applyFeatureSnapshot(draft);
    this.body.set(joinSegments(draft.segments));
    this.editing.set({
      key: `local:${draft.id}`,
      localId: draft.id,
      origin: 'local',
      titleKey: 'pages.write.editing.localDraft',
      savedAt: draft.updatedAt,
    });
    this.dirty.set(false);
    this.focusEditor();
  }

  // i18n pages.write.saved.plain: Saved.
  // i18n pages.write.saved.replacedDeleted: That draft was gone, so this was saved as a new one.
  // i18n pages.write.saved.copiedFrom: Saved as a local draft. The {{origin}} is still here too.
  // i18n pages.write.saved.withAttachments: {{saved}} Attachments remain only in this open editor.
  // i18n pages.write.saved.jotted: Saved a {{noun}}.
  /**
   * Save the editor to a local draft.
   *
   * Saving an already-local draft updates it in place rather than appending —
   * a workspace you work in for an hour must not leave forty copies behind. A
   * copy taken from another kind becomes local on its first save, and from then
   * on updates in place too; the source it was copied from is never touched.
   */
  protected save(): void {
    const current = this.editing();
    if (!current || !this.hasContent()) {
      return;
    }
    this.saveError.set(null);
    const snapshot = this.snapshot();
    if (current.localId) {
      const updated = this.drafts.update(current.localId, snapshot, current.savedAt ?? '');
      if (updated.updated) {
        this.afterSave(current, current.localId, updated.updatedAt!, {
          key: 'pages.write.saved.plain',
        });
        return;
      }
      // Deleted underneath us — in another tab, or from /drafts. Saving a fresh
      // copy is the only outcome that doesn't throw away what was just written.
      const saved = this.drafts.save(snapshot);
      if (!saved.durable) {
        this.saveError.set(
          'This draft could not be saved in your browser. Your writing is still here.',
        );
        return;
      }
      this.afterSave(current, saved.id, saved.updatedAt, {
        key: 'pages.write.saved.replacedDeleted',
      });
      return;
    }
    const saved = this.drafts.save(snapshot);
    if (!saved.durable) {
      this.saveError.set(
        'This draft could not be saved in your browser. Your writing is still here.',
      );
      return;
    }
    this.afterSave(
      current,
      saved.id,
      saved.updatedAt,
      current.origin && current.origin !== 'local'
        ? {
            key: 'pages.write.saved.copiedFrom',
            params: { origin: this.transloco.translate<string>(kindNounKey(current.origin)) },
          }
        : { key: 'pages.write.saved.plain' },
    );
  }

  private afterSave(current: Editing, localId: string, updatedAt: string, notice: Notice): void {
    const key = `local:${localId}`;
    // Carry the split mode across, so a copy that has just become a real draft
    // keeps the mode it was written in.
    const mode = this.workspace.splitMode(current.key);
    if (key !== current.key) {
      this.workspace.setSplitMode(key, mode);
    }
    this.editing.set({
      ...current,
      key,
      localId,
      titleKey: 'pages.write.editing.localDraft',
      savedAt: updatedAt,
    });
    this.dirty.set(false);
    // A whole extra key rather than gluing on a clause: "Saved." plus a bolted-on
    // sentence is exactly the concatenation the migration guide forbids, because
    // English word order isn't universal.
    this.flash(
      this.media().length
        ? {
            key: 'pages.write.saved.withAttachments',
            params: { saved: this.translateNotice(notice) },
          }
        : notice,
    );
  }

  /** Resolve a notice to its translated text, for embedding inside another sentence. */
  private translateNotice(notice: Notice): string {
    return this.transloco.translate<string>(notice.key, notice.params);
  }

  private snapshot(): DraftSnapshot {
    const segments = splitText(this.body(), this.splitMode(), { limit: MAX_POST_CHARS });
    return {
      segments: segments.length ? segments : [this.body()],
      spoilerText: this.cwOpen() ? this.spoilerText() : '',
      sensitive: this.sensitive(),
      visibility: this.visibility(),
      poll: this.pollOpen()
        ? {
            options: this.pollOptions(),
            multiple: this.pollMultiple(),
            expiresIn: this.pollExpiresIn(),
          }
        : null,
      postLanguage: this.postLanguage(),
      target: 'fedi',
    };
  }

  private applyFeatureSnapshot(snapshot: DraftSnapshot): void {
    // A saved visibility is a deliberate choice and outranks the account
    // default; dropping it here is what used to silently widen private drafts.
    this.visibilityState.choose(snapshot.visibility);
    this.spoilerText.set(snapshot.spoilerText);
    this.cwOpen.set(!!snapshot.spoilerText);
    this.sensitive.set(snapshot.sensitive);
    this.postLanguage.set(snapshot.postLanguage ?? '');
    if (snapshot.poll) {
      this.pollOpen.set(true);
      this.pollOptions.set(snapshot.poll.options.length >= 2 ? snapshot.poll.options : ['', '']);
      this.pollMultiple.set(snapshot.poll.multiple);
      this.pollExpiresIn.set(snapshot.poll.expiresIn);
    }
  }

  private resetAuthoringState(): void {
    for (const item of this.media()) {
      releaseDraftMedia(item);
    }
    this.media.set([]);
    this.mediaNotice.set('');
    // A fresh authoring session opens on the account's posting default; `open`
    // then overwrites this with the draft's own saved visibility.
    this.visibilityState.seed();
    this.cwOpen.set(false);
    this.spoilerText.set('');
    this.sensitive.set(false);
    this.pollOpen.set(false);
    this.pollOptions.set(['', '']);
    this.pollMultiple.set(false);
    this.pollExpiresIn.set(86400);
    const defaultLanguage =
      this.auth.account()?.source?.language?.toLowerCase().split(/[-_]/)[0] ?? '';
    this.postLanguage.set(
      defaultLanguage && this.knownLanguages.knows(defaultLanguage) ? defaultLanguage : '',
    );
    this.editorSelection = null;
    this.resetProofreading();
  }

  /** Review the current draft, then publish Bluesky in place. */
  protected publish(): void {
    if (!this.hasContent()) {
      return;
    }
    const first = firstStep(this.wizardEnabled());
    const firstTarget = this.wizardTargets().find(
      (target) => !this.targetUnsupportedReason(target),
    );
    if (firstTarget) {
      this.setWizardTarget(firstTarget);
    }
    if (!first) {
      if (this.wizardTarget() === 'bsky') {
        this.enterWizardStep('targets');
        void this.wizardFinish();
        return;
      }
      // Every step switched off. An empty dialog would be worse than none.
      // Attachments are the exception: their destination determines whether
      // they must be uploaded to Mastodon, so that choice cannot be skipped.
      if (this.media().length) {
        this.enterWizardStep('targets');
        return;
      }
      this.handOffToComposer();
      return;
    }
    this.enterWizardStep(first);
  }

  /**
   * Hand the text to the composer, which owns publishing.
   *
   * Deliberately not guarded. The unsaved-work guard exists to stop writing
   * being thrown away, and handing it to the composer is the opposite of
   * throwing it away — the text goes with you. Prompting "you have unsaved
   * writing" on the way to publishing it would be nonsense.
   */
  private handOffToComposer(): void {
    this.drafts.handoff({ ...this.snapshot(), target: this.wizardTarget() });
    this.dirty.set(false);
    this.wizardStep.set(null);
    void this.router.navigate(['/home']);
  }

  // ------------------------------------------------------------ publish wizard

  /** The step showing, or null when the wizard is closed. */
  protected wizardStep = signal<WizardStep | null>(null);
  protected wizardTarget = signal<PostTarget>('fedi');
  /** A datetime-local value, or empty for "now". */
  protected wizardScheduleAt = signal('');
  protected wizardError = signal<string | null>(null);
  protected wizardBusy = signal(false);

  protected readonly stepTitleKey = stepTitleKey;
  protected readonly targetLabel = targetLabel;

  protected canScheduleSelectedTarget = computed(
    () => this.wizardTarget() === 'fedi' && this.segments().length === 1,
  );

  protected wizardEnabled = computed(() => {
    const preferred = this.prefs.wizardSteps();
    return {
      ...preferred,
      preview: preferred.preview && !isObviousSingleton(this.body(), MAX_POST_CHARS),
      // Scheduling is meaningful only after an explicit destination choice.
      targets: preferred.targets || preferred.when,
      // Mastodon holds scheduled posts server-side. No browser timer is used.
      when: preferred.when && this.canScheduleSelectedTarget(),
    };
  });

  protected wizardPosition = computed(() => {
    const step = this.wizardStep();
    return step ? stepPosition(step, this.wizardEnabled()) : 0;
  });

  protected wizardTotal = computed(() => activeSteps(this.wizardEnabled()).length);

  protected wizardForwardLabel = computed(() => {
    const step = this.wizardStep();
    return step ? forwardLabel(step, this.wizardEnabled()) : 'wizard.forward.publish';
  });

  protected wizardCanGoBack = computed(() => {
    const step = this.wizardStep();
    return !!step && previousStep(step, this.wizardEnabled()) !== null;
  });

  /** Targets this session can actually post to, asked of the composer's own rules. */
  protected wizardTargets = computed(() => usableTargets(this.availability()));

  protected qualityFindings = computed(() =>
    runQualityChecks(this.body(), {
      limit: MAX_POST_CHARS,
      segments: this.segments().map((s) => s.text),
      vocab: this.prefs.pkmVocabulary(),
      missingAltText: this.undescribedMedia().length > 0,
      requireAltText: this.prefs.requireAltText(),
      // The readability band is itself a translation key; resolve it here so the
      // template's outer `| transloco: finding.messageParams` gets plain text
      // for `{{band}}` rather than a key it would print verbatim.
      translateBand: (key) => this.transloco.translate<string>(key),
    }),
  );

  /**
   * Each segment as the markup it will become.
   *
   * `applyMinimalMarkdown` operates on a status's *HTML*, so the plain body is
   * escaped and wrapped in paragraphs first — the same shape a server-rendered
   * status arrives in. It returns its input untouched when the text contains
   * nothing markdown-ish, which is the common case and costs nothing.
   */
  protected previewHtml = computed(() =>
    this.segments().map((segment) => applyMinimalMarkdown(toParagraphs(segment.text))),
  );

  protected setWizardTarget(target: PostTarget): void {
    if (!this.targetUnsupportedReason(target)) {
      this.wizardTarget.set(target);
      if (target !== 'fedi') {
        // A date chosen for Mastodon must not leak into a target that cannot
        // hold the work server-side.
        this.wizardScheduleAt.set('');
      }
      // Narrowing to a URL-addressed destination stashes the fediverse choice;
      // coming back puts it in place again rather than leaving the post on
      // whatever the blog leg forced.
      const allowed = allowedVisibilitiesFor(target);
      if (allowed) {
        this.visibilityState.clampFor(allowed, true);
      } else {
        this.visibilityState.restoreIfClamped();
      }
    }
  }

  protected setWizardScheduleAt(at: string): void {
    this.wizardScheduleAt.set(at);
  }

  protected wizardBack(): void {
    if (this.wizardBusy()) return;
    const step = this.wizardStep();
    if (step) {
      this.wizardError.set(null);
      const previous = previousStep(step, this.wizardEnabled());
      if (previous) {
        this.enterWizardStep(previous);
      }
    }
  }

  /** Cancel: back to the editor, nothing published, nothing lost. */
  protected wizardCancel(): void {
    if (this.wizardBusy()) return;
    this.wizardStep.set(null);
    this.wizardError.set(null);
    this.wizardBusy.set(false);
  }

  protected wizardForward(): void {
    const step = this.wizardStep();
    if (!step) {
      return;
    }
    const next = nextStep(step, this.wizardEnabled());
    if (next) {
      this.wizardError.set(null);
      this.enterWizardStep(next);
      return;
    }
    void this.wizardFinish();
  }

  private enterWizardStep(step: WizardStep): void {
    this.wizardStep.set(step);
  }

  protected toggleProofreadConsent(): void {
    this.proofreadConsentOpen.update((open) => !open);
  }

  private resetProofreading(): void {
    this.proofreadConsentOpen.set(false);
    this.proofreadGeneration++;
    this.aiFindings.set([]);
    this.aiProofreading.set(false);
    this.aiProofreadComplete.set(false);
    this.aiProofreadError.set(null);
  }

  protected async confirmAiProofreader(): Promise<void> {
    this.resetProofreading();
    if (!this.canUseAi()) {
      return;
    }
    const generation = this.proofreadGeneration;
    this.aiProofreading.set(true);
    try {
      const findings = await this.proofreader.run(this.body());
      if (generation === this.proofreadGeneration) {
        this.aiFindings.set(findings);
        this.aiProofreadComplete.set(true);
      }
    } catch (error: unknown) {
      if (generation === this.proofreadGeneration) {
        this.aiProofreadError.set(
          error instanceof Error ? error.message : "The AI proofreader couldn't be reached.",
        );
      }
    } finally {
      if (generation === this.proofreadGeneration) {
        this.aiProofreading.set(false);
      }
    }
  }

  protected targetUnsupportedReason(target: PostTarget): string | null {
    const scheduled = !!this.wizardScheduleAt() && target === 'fedi';
    const threaded = this.segments().length > 1;
    const hasMedia = this.media().length > 0;
    const hasPoll = this.pollOpen();
    const hasCw = this.cwOpen() && !!this.spoilerText().trim();
    const hasLanguage = !!this.postLanguage();
    if (scheduled && threaded) {
      return 'Scheduling supports one post, not a thread.';
    }
    if (target === 'bsky' && hasPoll) {
      return 'Bluesky has no polls.';
    }
    if (target === 'bsky' && hasCw) {
      return 'Bluesky has no content warnings.';
    }
    if (target === 'bsky' && this.sensitive()) {
      return 'Sensitive-media marking is not available for Bluesky-only publishing here.';
    }
    if (target === 'bsky' && this.media().some((item) => !item.file?.type.startsWith('image/'))) {
      return 'Bluesky accepts images here, not video or audio.';
    }
    if (target === 'bsky' && this.media().length > 4) {
      return 'Bluesky accepts at most four images.';
    }
    if (target === 'paste' && (hasMedia || hasPoll || threaded || scheduled || hasLanguage)) {
      return 'Paste services accept one text document without media, polls, threads, or scheduling.';
    }
    if ((target === 'blog' || target === 'blogger' || target === 'hugo') && !hasCw) {
      return 'Add a title with the CW control before publishing to a blog.';
    }
    if (
      (target === 'blog' || target === 'blogger' || target === 'hugo') &&
      (hasMedia || hasPoll || threaded || scheduled || hasLanguage)
    ) {
      return 'Blog targets accept one titled text document without media, polls, threads, or scheduling.';
    }
    return null;
  }

  protected targetCompatibilityNote(target: PostTarget): string | null {
    if (
      target === 'both' &&
      (this.pollOpen() ||
        (this.cwOpen() && this.spoilerText().trim()) ||
        this.sensitive() ||
        this.postLanguage())
    ) {
      return 'The poll, warning, sensitive flag, or language metadata applies to Mastodon; the text still goes to both.';
    }
    if (target === 'both' && this.media().some((item) => !item.file?.type.startsWith('image/'))) {
      return 'Video and audio go to Mastodon; Bluesky receives images only.';
    }
    if (target === 'both' && this.media().length > 4) {
      return 'Mastodon gets every attachment; Bluesky gets the first four images.';
    }
    return null;
  }

  /**
   * The end of the wizard.
   *
   * Bluesky stays in this workspace, including failures and thread recovery.
   * Other destinations retain their existing reviewed composer handoff.
   */
  private async wizardFinish(): Promise<void> {
    if (this.wizardBusy()) return;
    const target = this.wizardTarget();
    const parts = this.snapshot()
      .segments.map((part) => part.trim())
      .filter(Boolean);
    if (target === 'bsky' || target === 'both') {
      const threadError = blueskyThreadError(parts);
      if (threadError) {
        this.wizardError.set(threadError);
        return;
      }
    }
    const at = this.wizardScheduleAt();
    if (at && Number.isNaN(new Date(at).getTime())) {
      this.wizardError.set('That date could not be read. Pick a time, or publish now.');
      return;
    }
    const incompatibility = this.targetUnsupportedReason(this.wizardTarget());
    if (incompatibility) {
      this.wizardError.set(incompatibility);
      return;
    }
    if (this.altTextMissing()) {
      this.wizardError.set(
        altTextMessage(this.undescribedMedia(), true) ??
          this.transloco.translate<string>('pages.write.describeAttachmentsFirst'),
      );
      return;
    }
    if (this.pollOpen() && this.pollOptions().filter((option) => option.trim()).length < 2) {
      this.wizardError.set('A poll needs at least two choices.');
      return;
    }
    this.wizardBusy.set(true);
    this.wizardError.set(null);
    try {
      if (target === 'bsky') {
        await this.blueskyPublication.publish(parts, this.media());
        this.dirty.set(false);
        this.wizardStep.set(null);
        this.newDraft();
        this.publishedHere.set(true);
        return;
      }
      if (
        (this.wizardTarget() === 'fedi' || this.wizardTarget() === 'both') &&
        this.media().some((item) => item.media.id.startsWith('local:'))
      ) {
        await this.prepareMediaForTarget(this.wizardTarget());
      }
      this.drafts.handoff({ ...this.snapshot(), target: this.wizardTarget() }, undefined, {
        media: this.media(),
        scheduleAt: at,
        publishImmediately: true,
      });
      this.mediaTransferred = true;
      this.dirty.set(false);
      this.wizardStep.set(null);
      await this.router.navigate(['/home']);
    } catch (error: unknown) {
      this.wizardError.set(
        error instanceof Error ? error.message : "The attachments couldn't be prepared.",
      );
    } finally {
      this.wizardBusy.set(false);
    }
  }

  private async prepareMediaForTarget(target: PostTarget): Promise<void> {
    if (target !== 'fedi' && target !== 'both') {
      return;
    }
    this.uploading.set(true);
    try {
      const prepared: DraftMedia[] = [];
      for (const item of this.media()) {
        if (!item.media.id.startsWith('local:')) {
          prepared.push(item);
          continue;
        }
        if (!item.file) {
          throw new Error(
            'One attachment no longer has its original file. Remove it and attach it again.',
          );
        }
        const media = await firstValueFrom(this.api.uploadMedia(item.file, item.description));
        prepared.push({ ...item, media });
      }
      this.media.set(prepared);
    } finally {
      this.uploading.set(false);
    }
  }

  // --------------------------------------------------------- unsaved guarding

  /**
   * Run `action`, unless there is unsaved work — in which case hold it until
   * the user says what to do with it.
   *
   * A workspace that silently eats an edit fails at the one job it has. The
   * composer's autosave slot is a backstop, not a substitute: it holds one
   * body per context, so switching drafts twice would overwrite it.
   */
  private guard(action: () => void): void {
    if (this.dirty() && draftHasContent(this.snapshot())) {
      this.pendingSwitch.set({ run: action });
      return;
    }
    action();
  }

  /** Discard the unsaved body and continue with whatever was held up. */
  protected discardAndContinue(): void {
    const pending = this.pendingSwitch();
    this.pendingSwitch.set(null);
    if (pending) {
      this.dirty.set(false);
      pending.run();
    }
  }

  /** Save the unsaved body first, then continue. */
  protected saveAndContinue(): void {
    // Local drafts intentionally contain serializable post state only. Do not
    // let a reassuringly named action silently dispose of attached File data.
    if (this.media().length) {
      return;
    }
    const pending = this.pendingSwitch();
    this.pendingSwitch.set(null);
    this.save();
    if (pending) {
      this.dirty.set(false);
      pending.run();
    }
  }

  protected cancelSwitch(): void {
    this.pendingSwitch.set(null);
  }

  // -------------------------------------------------------------- writing zen

  protected enterZen(): void {
    this.zen.enter();
    this.focusEditor();
  }

  /** Leaving zen returns focus to the control that entered it. */
  protected exitZen(): void {
    this.zen.exit();
    setTimeout(() => this.zenButton()?.nativeElement.focus());
  }

  /**
   * Escape leaves zen.
   *
   * A mode that hides the entire interface needs more than one way out, and
   * Escape is the one people try first. The visible exit button is the other —
   * it stays on screen precisely because a mode you cannot see the way out of
   * is a trap.
   */
  protected onZenKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.exitZen();
    }
  }

  protected toggleLeft(): void {
    this.leftOpen.update((v) => !v);
  }

  protected toggleRight(): void {
    this.rightOpen.update((v) => !v);
  }

  private focusEditor(): void {
    setTimeout(() =>
      (this.zen.active() ? this.zenEditorBox() : this.editorBox())?.nativeElement.focus(),
    );
  }

  private flash(notice: Notice): void {
    this.notice.set(notice);
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(null), 5000);
  }
}

/**
 * A draft's segments as one editable body.
 *
 * Joined with the `---` marker so that reopening a thread shows the boundaries
 * the way they are typed, rather than silently collapsing a three-post thread
 * into one paragraph.
 */
function joinSegments(segments: readonly string[]): string {
  return segments.filter((s) => s.trim() !== '').join('\n\n---\n\n');
}

/**
 * Plain text as escaped paragraph HTML.
 *
 * Escaping first is not optional: the body is whatever the user typed, and it
 * reaches the preview through `[innerHTML]`. Anything that looks like a tag has
 * to arrive as text, or the preview becomes an injection point into the app's
 * own page.
 */
function toParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isAttachable(file: File): boolean {
  return /^(image|video|audio)\//.test(file.type);
}

function localDraftMedia(file: File): DraftMedia {
  const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
  const id =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    media: {
      id: `local:${id}`,
      type: mediaTypeOf(file),
      url,
      preview_url: url,
      description: null,
    },
    description: '',
    file,
  };
}

function releaseDraftMedia(item: DraftMedia): void {
  if (
    item.media.id.startsWith('local:') &&
    item.media.url &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(item.media.url);
  }
}

// i18n pages.write.editing.localDraft: Local draft
// i18n pages.write.editing.newDraft: New draft
// i18n pages.write.editing.copyOfParkedPost: Copy of a parked post
// i18n pages.write.editing.copyOfPrivateNote: Copy of a private note
// i18n pages.write.editing.copyOfPaste: Copy of a paste
function kindTitleKey(kind: DraftKind): string {
  switch (kind) {
    case 'local':
      return 'pages.write.editing.localDraft';
    case 'scheduled':
      return 'pages.write.editing.copyOfParkedPost';
    case 'self':
      return 'pages.write.editing.copyOfPrivateNote';
    case 'paste':
      return 'pages.write.editing.copyOfPaste';
  }
}

// i18n pages.write.kindNoun.local: original draft
// i18n pages.write.kindNoun.scheduled: parked post
// i18n pages.write.kindNoun.self: private note
// i18n pages.write.kindNoun.paste: paste
function kindNounKey(kind: DraftKind): string {
  switch (kind) {
    case 'local':
      return 'pages.write.kindNoun.local';
    case 'scheduled':
      return 'pages.write.kindNoun.scheduled';
    case 'self':
      return 'pages.write.kindNoun.self';
    case 'paste':
      return 'pages.write.kindNoun.paste';
  }
}

/**
 * The visibilities a destination can actually express, or null when it accepts
 * the full fediverse set.
 *
 * Blogs and pastes publish to a URL, so the only honest answer is `public`.
 * Bluesky has no followers-only or direct post, so a private draft crossing to
 * it would be silently widened; clamping to `public` at least makes the change
 * visible in the picker before publishing rather than after.
 */
function allowedVisibilitiesFor(target: PostTarget): readonly string[] | null {
  switch (target) {
    case 'blog':
    case 'blogger':
    case 'hugo':
    case 'paste':
    case 'bsky':
      return ['public'];
    default:
      return null;
  }
}
