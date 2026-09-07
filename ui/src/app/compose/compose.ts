import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom, forkJoin, of, switchMap } from 'rxjs';
import { Api } from '../api';
import { Server } from '../server';
import { PageDiagnostics } from '../page-diagnostics';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import { VisibilityState, VISIBILITIES } from './visibility-state';
import { altTextMessage, mediaTypeOf, undescribedIndexes } from './alt-text';
import { LinkShortening } from './link-shortening';
import { TagHelperDialog } from './tag-helper-dialog/tag-helper-dialog';
import { OpenRouterSession } from '../providers/openrouter/openrouter-session';
import { AiAvailability } from '../ai-availability';
import { TranslateDialog, TranslateResult } from './translate-dialog/translate-dialog';
import { CustomEmojis } from '../custom-emojis';
import { Draft, DraftMedia, DraftSnapshot, Drafts, draftHasContent } from '../drafts';
import { PkmKind, pkmKinds, pkmLabel } from '../pkm/pkm-tags';
import { TargetAvailability, restorableTarget } from './post-targets';
import { EmojiPicker } from '../emoji-picker/emoji-picker';
import { ComposeOptions, MediaAttachment, Status } from '../models';
import { BlueskyApi, tidFromSeed } from '../providers/bluesky/bluesky-api';
import { detectFacets, graphemeLength } from '../providers/bluesky/bluesky-facets';
import { buildLocalBskyStatus } from '../providers/bluesky/bluesky-local-status';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { BskyFacet, BskyImagesEmbed } from '../providers/bluesky/bluesky-types';
import { prepareImageForBluesky } from '../providers/bluesky/bluesky-image';
import { PasteHistory } from '../providers/paste/paste-history';
import { PasteExpiry } from '../providers/paste/paste-provider';
import { PasteProviderRegistry } from '../providers/paste/paste-provider-registry';
import { ProxyConsentDialog } from '../providers/shortener/proxy-consent-dialog/proxy-consent-dialog';
import { applyMinimalMarkdown } from '../markdown';
import { Terminology } from '../terminology';
import { longUrls, postLength } from './post-length';
import { renderStatusText } from './status-text';
import { FeatureFlags } from '../feature-flags';
import { KnownLanguages } from '../trend-language-filter';
import { LANG_NAMES, LangCode, confidentLanguage } from '../language-detect';
import { stripHtml } from '../sentiment';
import { MataroaApi } from '../providers/mataroa/mataroa-api';
import { MataroaSettings } from '../providers/mataroa/mataroa-settings';
import { mataroaStatus } from '../providers/mataroa/mataroa-status';
import { BloggerApi } from '../providers/blogger/blogger-api';
import { BloggerSession } from '../providers/blogger/blogger-session';
import { bloggerStatus } from '../providers/blogger/blogger-status';
import { HugoSettings } from '../providers/hugo/hugo-settings';
import { TargetAvailabilitySource } from './target-availability';
import { HugoPublish } from '../providers/hugo/hugo-publish';
import { HugoEditSession } from '../providers/hugo/hugo-edit-session';
import { HugoDeployWatch } from '../providers/hugo/hugo-deploy-watch';
import { describeDeployState } from '../providers/hugo/hugo-deploy';
import { HugoApiError } from '../providers/hugo/hugo-contents';
import { hugoStatus } from '../providers/hugo/hugo-post';

/** Mastodon's default per-status character limit. */
export const MAX_POST_CHARS = 500;

/**
 * True for any target that publishes to a blog rather than a timeline.
 *
 * Blog targets share every composer rule — a title is required, media and polls
 * are not supported, the character limit does not apply — so the rules key off
 * this rather than naming each service, and a third blog connector inherits
 * them by being added here.
 */
export function isBlogTarget(target: PostTarget): target is BlogTarget {
  return target === 'blog' || target === 'blogger' || target === 'hugo';
}

/** The blog targets, narrowed so per-service copy can be exhaustive. */
export type BlogTarget = 'blog' | 'blogger' | 'hugo';

/**
 * What to say when a draft's blog target is no longer publishable — the
 * connector was disconnected, flagged off, or its credential aged out between
 * writing the draft and sending it. Each names its own service, because
 * "reconnect your blog" is useless to someone with three of them.
 */
const RECONNECT_BLOG_MESSAGE: Record<BlogTarget, string> = {
  blogger: 'Reconnect Blogger in Settings, and choose a blog, before publishing this draft.',
  blog: 'Reconnect Mataroa in Settings before publishing this draft.',
  hugo: 'Reconnect your Hugo repository in Settings before publishing this draft.',
};

/** Where a top-level compose publishes. Paste is always exclusive to avoid correlation. */
/**
 * Where a top-level compose publishes. Paste is always exclusive to avoid correlation.
 *
 * `blog`, `blogger` and `hugo` are three *different blogs*, not three ways of
 * saying one: `blog` is the Mataroa connector (named before there was a
 * second), `blogger` is Google's, and `hugo` is a static site in a GitHub repo.
 * All three can be connected at once, so the picker offers whichever are linked
 * and the user chooses per post.
 */
export type PostTarget = 'fedi' | 'bsky' | 'both' | 'paste' | 'blog' | 'blogger' | 'hugo';

/** Bluesky's post limit, in graphemes (not characters). */
export const BSKY_MAX_GRAPHEMES = 300;
const MAX_PASTE_BYTES = 2 * 1024 * 1024;

/**
 * Pull the HTTP status out of a paste failure for logging. A cross-origin fetch
 * that a CORS policy blocks (or that never connects) surfaces as an
 * HttpErrorResponse with `status: 0` — the browser deliberately hides the real
 * response, so there is no code to show and no point retrying.
 */
function describePasteFailure(error: unknown): { status: number | null; hint: string } {
  if (error instanceof HttpErrorResponse) {
    return {
      status: error.status,
      hint:
        error.status === 0
          ? 'CORS-blocked or network failure — status is opaque to the browser'
          : error.statusText || 'HTTP error',
    };
  }
  return { status: null, hint: error instanceof Error ? error.message : 'non-HTTP error' };
}

/** One extra field from an error body, rendered as a labelled row. */
export interface PostFailureDetail {
  label: string;
  value: string;
}

/**
 * A failed post, in a shape the UI can render without knowing the server.
 *
 * `message` is the headline. `details` carries everything else the body said.
 */
export interface PostFailure {
  message: string;
  details: PostFailureDetail[];
}

interface PostedBskyPart {
  ref: { uri: string; cid: string };
  facets: BskyFacet[];
}

/** Retry state for one unchanged timeline publication. Kept only in this composer. */
interface PostingOperation {
  id: string;
  fingerprint: string;
  target: 'fedi' | 'bsky' | 'both';
  parts: string[];
  options: ComposeOptions;
  scheduledFor: Date | null;
  fedi: {
    statuses: Status[];
    complete: boolean;
    inFlight: boolean;
    failure: PostFailure | null;
  };
  bsky: {
    parts: PostedBskyPart[];
    createdAt: string[];
    preparedFacets: (BskyFacet[] | undefined)[];
    embed?: BskyImagesEmbed;
    complete: boolean;
    inFlight: boolean;
    failedAt: number | null;
  };
}

/** Fields we render as the headline or handle specially, not as detail rows. */
const HANDLED_ERROR_KEYS = new Set(['error', 'error_description', 'message', 'detail', 'details']);

/** Keys not worth showing a user: plumbing, not explanation. */
const NOISE_ERROR_KEYS = new Set(['request_id', 'status', 'statuscode', 'timestamp', 'path']);

/** Turn snake_case / camelCase keys into something readable. */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Render a JSON value as a single readable line. */
function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyValue).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${humanizeKey(k)}: ${stringifyValue(v)}`)
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

/** Parse an error body that may arrive already-parsed or as a raw string. */
function parseErrorBody(raw: unknown): Record<string, unknown> | null {
  let body = raw;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      // A non-JSON body (an HTML error page) is not worth showing verbatim.
      return null;
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/**
 * Turn a failed post into something worth showing the user.
 *
 * Servers reject posts for reasons the user can act on — too long, a link in
 * the text, a missing hashtag, moderated wording — and they say which in the
 * response body. Rendering "try again" instead tells the user nothing and they
 * retry the identical text forever.
 *
 * Deliberately generic about the body's shape. Server-side validation evolves,
 * and a client that only understands the codes it was written against gets
 * steadily less useful as new ones appear. So: use the known message fields for
 * the headline, then show *every other field* as a labelled row rather than
 * discarding it. A rule this client has never heard of still explains itself.
 */
export function describePostFailure(error: unknown): PostFailure {
  const plain = (message: string): PostFailure => ({ message, details: [] });

  if (!(error instanceof HttpErrorResponse)) {
    return plain(
      error instanceof Error && error.message ? error.message : "Couldn't post — try again.",
    );
  }
  // status 0 is the browser hiding a CORS/network failure; there is no body.
  if (error.status === 0) {
    return plain("Couldn't reach the server (offline, or it isn't sending CORS headers).");
  }

  const body = parseErrorBody(error.error);
  if (!body) {
    if (error.status === 401 || error.status === 403) {
      return plain('That account is no longer signed in — reauthenticate and try again.');
    }
    return plain(`Couldn't post (HTTP ${error.status}) — try again.`);
  }

  // Headline: the first human-readable field the server offered.
  let message = '';
  for (const key of ['error_description', 'error', 'message', 'detail']) {
    const v = body[key];
    if (typeof v === 'string' && v.trim()) {
      message = v.trim();
      break;
    }
  }

  // Everything else the body carried. This is what keeps the client useful as
  // the server grows rules it has never heard of: an unrecognized `limit`,
  // `field`, or `retry_at` still reaches the user instead of being dropped.
  const details: PostFailureDetail[] = [];
  for (const [key, value] of Object.entries(body)) {
    const lower = key.toLowerCase();
    if (HANDLED_ERROR_KEYS.has(lower) || NOISE_ERROR_KEYS.has(lower)) continue;
    const text = stringifyValue(value);
    if (text) {
      details.push({ label: humanizeKey(key), value: text });
    }
  }

  if (!message) {
    if (error.status === 401 || error.status === 403) {
      message = 'That account is no longer signed in — reauthenticate and try again.';
    } else if (details.length) {
      // The body said something, just not in a field we recognize as the
      // headline. The detail rows below carry it.
      message = 'The server rejected that post:';
    } else {
      message = `Couldn't post (HTTP ${error.status}) — try again.`;
    }
  }

  return { message, details };
}

/** Poll expiry presets (label → seconds). */
const POLL_EXPIRY = [
  { label: '5 minutes', seconds: 300 },
  { label: '1 hour', seconds: 3600 },
  { label: '6 hours', seconds: 21600 },
  { label: '1 day', seconds: 86400 },
  { label: '3 days', seconds: 259200 },
  { label: '7 days', seconds: 604800 },
];

/**
 * A media attachment that has been uploaded and is pending attachment to a post.
 *
 * `file` is the *original* bytes, kept alongside the uploaded Mastodon
 * attachment. Bluesky cannot reuse Mastodon's upload — its `uploadBlob` wants
 * the bytes, in its own repo, under its own ~1MB ceiling — so discarding the
 * File at upload time (which is what used to happen) made a Bluesky image post
 * impossible to build. Absent for an attachment restored from a draft, where
 * only the Mastodon reference survived.
 */
type PendingMedia = DraftMedia;

/** Mastodon accepts images, video and audio as attachments. */
function isAttachable(file: File): boolean {
  return /^(image|video|audio)\//.test(file.type);
}

/** Bluesky posts accept images only — no video, no audio. */
function isBlueskyAttachable(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Bluesky's limit: four images per post.
 *
 * Enforced when picking rather than at submit, so the fifth photo is refused
 * where the reader can see why, not after they have written the post.
 */
const BSKY_MAX_IMAGES = 4;

/**
 * A stand-in attachment for a file held locally, not uploaded anywhere yet.
 *
 * A Bluesky-only post has no Mastodon upload to describe, but the composer's
 * preview and alt-text editor both read a `MediaAttachment`. An object URL gives
 * them a real image to render; the `id` is marked so nothing mistakes it for a
 * server-side attachment it could reference by id.
 */
function localMedia(file: File): MediaAttachment {
  const url = URL.createObjectURL(file);
  return {
    id: `local:${crypto.randomUUID()}`,
    type: mediaTypeOf(file),
    url,
    preview_url: url,
    description: null,
  };
}

/** Whether an attachment is one of the local-only ones {@link localMedia} made. */
function isLocalMedia(media: MediaAttachment): boolean {
  return media.id.startsWith('local:');
}

/**
 * Revoke a local attachment's object URL.
 *
 * An object URL pins the whole file in memory until revoked. Four phone photos
 * attached and removed a few times is tens of megabytes held for the life of
 * the tab — worth the two lines, and invisible if it goes wrong.
 */
function releaseLocalMedia(media: MediaAttachment): void {
  if (isLocalMedia(media)) {
    URL.revokeObjectURL(media.url);
  }
}

/** True when the drag carries files (not text selections, links, …). */
function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

// i18n compose.editing: Editing
// i18n compose.cancelEdit: Cancel edit
// i18n compose.dismissBuildStatus: Dismiss build status
// i18n compose.replyMentionHint: 💬 The leading <strong>&#64;handle</strong> notifies them of your reply. Remove it to reply without sending a mention notification.
// i18n compose.placeholder: What is happening?
// i18n compose.threadPostPlaceholder: Post {{index}} of the thread
// i18n compose.removeFromThread: Remove this {{noun}} from the thread
// i18n compose.choicePlaceholder: Choice {{index}}
// i18n compose.postTo: {{noun}} to
// i18n compose.postLanguage: {{noun}} language
// i18n compose.scheduleThis: Schedule {{noun}}
// i18n compose.suggestHashtagsFor: Suggest hashtags for this {{noun}}
// i18n compose.translateThis: Translate this {{noun}} into another language
// i18n compose.addAnotherPost: Add another {{noun}} (thread / tweet storm)
// i18n compose.byteCount: {{count}} bytes

// i18n compose.addChoice: + Add choice
// i18n compose.addPoll: Add poll
// i18n compose.allowMultiple: Allow multiple
// i18n compose.altPlaceholder: Describe for the visually impaired
// i18n compose.attachMedia: Attach media — or paste / drag & drop an image
// i18n compose.blueskyLimit: Bluesky limit
// i18n compose.cancel: Cancel
// i18n compose.clear: Clear
// i18n compose.deleteDraftCopy: Delete the private draft copy?
// i18n compose.dismiss: Dismiss
// i18n compose.drafts: Drafts
// i18n compose.insertEmoji: Insert emoji
// i18n compose.markSensitive: Mark media sensitive
// i18n compose.pasteExpiry: Paste expiry
// i18n compose.pasteService: Paste service
// i18n compose.postingIn: Posting in
// i18n compose.previewEmpty: Nothing here yet…
// i18n compose.previewHeading: Preview
// i18n compose.publishAt: Publish at
// i18n compose.publishNow: Publish now
// i18n compose.remove: Remove
// i18n compose.removeChoice: Remove choice
// i18n compose.showDrafts: Show drafts
// i18n compose.syntaxLanguage: Syntax language
// i18n compose.threadSummary: Will post as a thread of {{count}}.
// Complete thread hint: count is the number of composer segments. Keep punctuation
// and count placement in the translation; plain interpolation escapes all text.
// Retain the old declaration until deferred locale dictionaries retire their
// fragment keys. Rendering uses threadSummary, with English fallback as needed.
// i18n compose.threadOf: Will post as a thread of
// i18n compose.titlePrefix: Title:
// i18n compose.togglePreview: Toggle preview
// i18n compose.visibility: Visibility
// i18n compose.bskyAudience: Bluesky posts are public. Choose public visibility to publish to Bluesky, or select Fedi to keep a restricted audience.
// i18n compose.visibilityFixed: Visibility is fixed here
// i18n compose.warn.blogOneDoc: Blog posts accept one titled Markdown document here — remove media, polls, thread boxes, or scheduling.
// i18n compose.warn.bskyNoPolls: Bluesky has no polls — remove the poll first.
// i18n compose.warn.bskyThreads: Threads post to Bluesky as a chain of replies, one box per post.
// i18n compose.warn.overLimit.a: A post is over
// i18n compose.warn.overLimit.b: characters — shorten it or move text to another thread post (➕🧵).
// i18n compose.warn.pasteOneDoc: Paste services accept one text document here — remove media, polls, thread boxes, or scheduling.
// i18n compose.warn.pasteTooBig: This paste is over the provider's 2 MB limit.
// i18n compose.warn.pollsCwFediOnly: Polls and CWs go to Fedi only — images go to both.
// i18n compose.warn.scheduleFediOnly: Scheduling is Fedi-only — switch the post target to 🦣.

// i18n compose.target.fedi: 🦣 Fedi
// i18n compose.target.bluesky: 🦋 Bluesky
// i18n compose.target.both: 🦣+🦋 Both
// i18n compose.target.mataroa: ✍️ Mataroa
// i18n compose.target.paste: 📋 Paste
// i18n compose.draftsTab: 📝 Drafts
// i18n compose.saveAsDraft: 💾 Save as draft
// i18n compose.langMismatch: You set the language to <strong>{{picked}}</strong>, but this reads as <strong>{{detected}}</strong>. Post anyway, or fix it?
// i18n compose.keepEditing: Keep editing
// i18n compose.publishAnyway: Publish anyway
// i18n compose.notPosted: Not posted
// i18n compose.savedToDrafts: Saved to drafts.
// i18n compose.draftUnsaved: This draft could not be saved in your browser. Your writing is still here.
// i18n compose.downloadDraft: Download a copy
// i18n compose.changedBeforePublish: The post or account changed while attachments were being saved. Nothing new was published. Review your post and send it again.
// i18n compose.warn.threadsNoSchedule: Threads can't be scheduled — remove the extra posts.

// i18n compose.postAs: Post as {{language}}

// i18n compose.blogDraft: Draft
// i18n compose.switchTo: Switch to {{language}}
// i18n compose.pkmWarning: This is tagged <strong>{{label}}</strong>. Publishing posts it to your followers.
// i18n compose.warn.pasteDisabled: This paste draft cannot be published while Pastebin is disabled in Settings → Feature flags.
// i18n compose.warn.scheduleTooSoon: Times less than ~5 minutes out publish immediately instead of scheduling.

@Component({
  selector: 'app-compose',
  imports: [
    FormsModule,
    RouterLink,
    EmojiPicker,
    ConfirmDialog,
    TagHelperDialog,
    TranslateDialog,
    ProxyConsentDialog,
    TranslocoPipe,
  ],
  templateUrl: './compose.html',
  styleUrl: './compose.css',
  providers: [VisibilityState, LinkShortening],
})
export class Compose implements OnDestroy {
  private api = inject(Api);
  private server = inject(Server);
  private transloco = inject(TranslocoService);
  protected auth = inject(Auth);
  private prefs = inject(ClientPrefs);
  private linkShortening = inject(LinkShortening);
  private bskyApi = inject(BlueskyApi);
  protected bskySession = inject(BlueskySession);
  private drafts = inject(Drafts).forCurrentAccount();
  private customEmojis = inject(CustomEmojis);
  protected pasteProviders = inject(PasteProviderRegistry);
  private pasteHistory = inject(PasteHistory);
  private diagnostics = inject(PageDiagnostics);
  protected featureFlags = inject(FeatureFlags);
  protected words = inject(Terminology).words;
  private knownLanguages = inject(KnownLanguages);
  protected mataroa = inject(MataroaSettings);
  private mataroaApi = inject(MataroaApi);
  protected blogger = inject(BloggerSession);
  private bloggerApi = inject(BloggerApi);
  protected hugo = inject(HugoSettings);
  private availability = inject(TargetAvailabilitySource);
  private hugoPublish = inject(HugoPublish);
  protected hugoEdit = inject(HugoEditSession);
  protected deployWatch = inject(HugoDeployWatch);
  private destroyed = false;

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearCountdown();
    this.flushAutosave();
    // A publish followed by navigating away must not leave a poller running.
    this.deployWatch.stop();
  }

  /** One sentence about the in-flight build, for the chip under the composer. */
  protected readonly deployMessage = computed(() => {
    const state = this.deployWatch.current();
    return state ? describeDeployState(state) : null;
  });

  readonly inReplyToId = input<string | undefined>(undefined);
  /** When set, the composed status quotes this status id. */
  readonly quotedStatusId = input<string | undefined>(undefined);
  /**
   * The box's prompt. Empty means "use the default", which is a translation key
   * rather than an English literal: an `input()` default is evaluated before an
   * injection context exists, so it cannot call `translate()` itself. Home,
   * Drafts and Conversations rely on this default; the reply and paste
   * composers pass their own already-translated text.
   */
  readonly placeholder = input('');
  protected readonly placeholderText = computed(
    () => this.placeholder() || this.transloco.translate<string>('compose.placeholder'),
  );
  /** Optional pre-seeded body (e.g. @mentions for a direct reply). */
  readonly initialText = input('');
  /**
   * The parent author's handle (bare `acct`, e.g. `alice@dmv.community`) for a
   * reply. When set and no explicit {@link initialText} is given, the composer
   * seeds `@handle ` into the box so the reply actually notifies them — matching
   * mastodon.social's own default. Verified live: a reply with `in_reply_to_id`
   * but no `@handle` in the body threads correctly yet sends NO notification, so
   * this seed is what makes "reply" ping the person by default. The user can
   * delete the handle to reply silently; {@link showReplyMentionHint} explains it.
   */
  readonly replyToHandle = input('');
  /**
   * Optional initial visibility (e.g. 'direct' for a conversation reply). Empty
   * means "no opinion" — the composer then opens on the account's own posting
   * default (`ClientPrefs.defaultVisibility`), which is what a top-level compose
   * wants. A caller that passes a value is always obeyed.
   */
  /**
   * Open on a specific post target, when the caller already asked the user.
   *
   * Set by the share dialog, which offers exactly the targets this composer
   * would accept (both read `post-targets.ts`). Empty means "no opinion" and the
   * usual default applies.
   */
  readonly initialTarget = input<PostTarget | ''>('');
  readonly initialVisibility = input('');
  /** Pin visibility to initialVisibility (no picker) — e.g. private chats stay direct. */
  readonly lockVisibility = input(false);
  /** A saved draft to open in the composer (it is consumed from the drafts list). */
  readonly initialDraft = input<Draft | undefined>(undefined);
  /**
   * Chat-style compact layout: everything on one toolbar row, preview off by
   * default (toggleable), drafts behind an icon. Used where vertical and
   * horizontal space is scarce (/conversations).
   */
  readonly compact = input(false);
  /**
   * Whether this mount participates in "thoughtful posting" (see
   * {@link ClientPrefs.thoughtfulPosting}). Opt-in, and deliberately so: a
   * surface that should have been gated but isn't merely behaves as it always
   * has, while a surface that shouldn't have been gated but is would silently
   * stop someone replying. Only Home and the quote composers opt in — replies,
   * chats, and the paste-share composer never do.
   */
  readonly gateable = input(false);
  readonly posted = output<Status>();

  /**
   * True when this composer must not publish: it saves a draft instead, and the
   * post happens later from /drafts. The whole point is the gap in between.
   */
  protected gated = computed(() => this.gateable() && this.prefs.thoughtfulPosting());

  // i18n compose.savesToDraftsHint: Saves to Drafts — post it from there when you're ready
  // i18n compose.submit.uploading: Uploading…
  // i18n compose.submit.saveDraft: Save draft
  // i18n compose.submit.reply: Reply
  // i18n compose.submit.quote: Quote
  // i18n compose.submit.schedule: Schedule
  // i18n compose.submit.paste: Paste
  // i18n compose.submit.updatePost: Update post
  // i18n compose.submit.publish: Publish
  /**
   * Translation key for the submit button's label.
   *
   * Every branch is a whole, independent phrase rather than a word glued onto
   * a shared stem, so each gets its own key — nothing here concatenates.
   */
  protected submitLabelKey = computed(() => {
    if (this.uploading()) {
      return 'compose.submit.uploading';
    }
    if (this.gated()) {
      return 'compose.submit.saveDraft';
    }
    if (this.inReplyToId()) {
      return 'compose.submit.reply';
    }
    if (this.quotedStatusId()) {
      return 'compose.submit.quote';
    }
    if (this.scheduleActive()) {
      return 'compose.submit.schedule';
    }
    if (this.targetIncludesPaste()) {
      return 'compose.submit.paste';
    }
    if (this.targetIncludesBlog()) {
      if (this.hugoEdit.editing()) {
        return 'compose.submit.updatePost';
      }
      return this.blogDraft() ? 'compose.submit.saveDraft' : 'compose.submit.publish';
    }
    return null;
  });

  protected readonly visibilities = VISIBILITIES;
  protected readonly pollExpiry = POLL_EXPIRY;

  protected text = signal('');

  // --- LLM tag helper (sprint openrouter-5) ---
  private openrouter = inject(OpenRouterSession);
  private ai = inject(AiAvailability);
  protected tagHelperOpen = signal(false);

  /**
   * Hidden rather than disabled when OpenRouter isn't connected: connections are
   * a power-user surface, and a button that only explains why it doesn't work is
   * worse than no button (decision 9 in sprint/openrouter-0-overview.md).
   */
  protected canUseTagHelper = computed(() => this.ai.enabled() && this.openrouter.connected());

  // --- LLM "translate to" ---
  protected translateOpen = signal(false);

  /** Same rule as the tag helper: no OpenRouter, no button (not a dead button). */
  protected canTranslate = this.canUseTagHelper;

  /**
   * Apply a translation to the box being composed.
   *
   * Replacing also sets the post language, because a post rewritten into
   * Esperanto that still declares `en` is exactly the mislabelling the feed
   * filter exists to catch. The target is added to the known-languages list
   * first, since the picker only offers those and would otherwise render a
   * blank selection for a language the user just deliberately posted in.
   *
   * Appending deliberately does not touch the language: a bilingual post has no
   * single language, and guessing one would be worse than leaving the user's
   * choice alone.
   */
  useTranslation(result: TranslateResult): void {
    this.translateOpen.set(false);
    if (result.mode === 'replace') {
      this.text.set(result.text);
      this.prefs.addKnownLanguage(result.code);
      this.onLanguageChange(result.code);
      return;
    }
    const current = this.text().trimEnd();
    this.text.set(current ? `${current}\n\n${result.text}` : result.text);
  }

  /**
   * Append suggested tags to the post, skipping any already present.
   *
   * Appending rather than replacing: the user may have written tags inline, and
   * silently rewriting someone's post is not this feature's job.
   */
  useSuggestedTags(tags: string[]): void {
    this.tagHelperOpen.set(false);
    const current = this.text();
    const existing = new Set(
      (current.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()),
    );
    const additions = tags
      .map((tag) => tag.replace(/^#/, '').trim())
      .filter((tag) => tag && !existing.has(tag.toLowerCase()))
      .map((tag) => `#${tag}`);
    if (!additions.length) {
      return;
    }
    const separator = !current.trim() ? '' : /\s$/.test(current) ? '' : ' ';
    this.text.set(current + separator + additions.join(' '));
  }
  /** Extra thread boxes ("tweet storm"): each is one additional self-reply post. */
  protected thread = signal<string[]>([]);
  protected submitting = signal(false);

  // Visibility + content warning.
  /**
   * Visibility state, shared with `/write` so the stash/clamp/restore rules
   * exist once. See {@link VisibilityState}; the picker markup stays local
   * because a cramped `<select>` and the writing page's roomy row are
   * genuinely different UI over the same state.
   */
  private visibilityState = inject(VisibilityState);
  protected visibility = this.visibilityState.value;

  /**
   * Selected post language: an ISO 639-1 code, or '' for "Not specified" (let
   * the server auto-detect). The picker offers only the languages we believe
   * the user knows ({@link KnownLanguages}) rather than all ~180 ISO codes —
   * you almost always post in a language you read. Defaults to the posting
   * default when it's among the known set, else "Not specified".
   */
  protected postLanguage = signal<string>('');
  /** Options for the language picker: the known languages, named + sorted. */
  protected languageOptions = computed(() =>
    [...this.knownLanguages.codes()]
      .map((code) => ({ code, name: LANG_NAMES[code as LangCode] ?? code.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  /** True once the default has been seeded, so it isn't re-applied over a user pick. */
  private seededLanguage = false;

  /**
   * A pending "you picked X but this reads as Y" confirmation. Non-null blocks
   * the send and drives the warning banner; the user either fixes the picker or
   * confirms and posts anyway.
   */
  protected langMismatch = signal<{ picked: string; detected: string } | null>(null);

  /**
   * The PKM kinds a post about to be published carries, while the "this is
   * tagged as a note" warning is up. Null when there is no warning showing.
   *
   * A warning rather than a block: a public `#NOTE` post is a legitimate thing
   * to want, and a hard block on a hashtag would be infuriating the first time
   * it was wrong.
   */
  protected pkmWarning = signal<PkmKind[] | null>(null);

  /**
   * A mismatch the user explicitly dismissed ("keep editing"). While the picked
   * language and detected language still match this pair, {@link submit} won't
   * re-raise the banner — so dismissing genuinely gets it out of the way instead
   * of having it pop straight back on the next Post. Cleared whenever the picker
   * changes or the text is re-detected to something new.
   */
  private dismissedMismatch = signal<{ picked: string; detected: string } | null>(null);

  /** Every box in order; index 0 is the primary post. */
  protected segments = computed(() => [this.text(), ...this.thread()]);

  /**
   * Whether to show the "removing the @handle replies without notifying them"
   * hint. Shown only for replies whose body currently *leads* with an @mention —
   * so it appears while the seeded handle is present and quietly disappears the
   * moment the user deletes it (their signal that they've opted out of the ping).
   */
  protected showReplyMentionHint = computed(
    () => !!this.inReplyToId() && /^\s*@[\w.-]+(@[\w.-]+)?/.test(this.text()),
  );

  constructor() {
    // Seed the composer from inputs + any autosaved text or explicitly opened
    // draft. This re-seeds only when the *conversation context* changes (a
    // container like /conversations reuses one instance across replies), keyed
    // by contextKey + draft identity. It must NOT re-run on unrelated signal
    // churn: it reads localStorage, so re-applying within the same context would
    // reload the previous autosave and silently clobber a live edit — e.g. the
    // paste provider the user just picked, before the debounced autosave below
    // has written it. The `seededKey` guard prevents that.
    effect(() => {
      const draft = this.initialDraft();
      // A caller's explicit initialText wins; otherwise, for a reply, seed the
      // parent author's @handle so the reply notifies them by default (see
      // replyToHandle). Never seed the user's own handle — like mastodon.social,
      // replying to yourself gets an empty box. Non-reply composers seed nothing.
      const handle = this.replyToHandle().trim();
      const mine = this.auth.account()?.acct;
      const seedHandle = handle && handle !== mine ? `@${handle} ` : '';
      const initialText = this.initialText() || seedHandle;
      const initialVisibility = this.initialVisibility();
      const key = `${this.contextKey()}|${draft?.id ?? ''}`;
      if (key === this.seededKey) {
        return;
      }
      this.seededKey = key;
      this.previewSeed.set(/^\s*(?:@\S+\s*)+$/.test(initialText) ? initialText.trim() : '');
      this.text.set(initialText);
      // No caller opinion means a top-level compose: open on the account's own
      // posting default rather than assuming `public`.
      this.visibilityState.seed(initialVisibility);
      // A handoff from "Edit for post" outranks a stale autosave: the user just
      // asked for this specific post, and it only ever seeds once. An explicitly
      // opened draft still wins over both.
      const handoff = this.acceptsHandoff() ? this.drafts.takeHandoff() : null;
      this.selfDraftOrigin = handoff?.selfStatusId ?? null;
      const saved = draft ?? handoff?.snapshot ?? this.drafts.loadAutosave(this.contextKey());
      if (saved && draftHasContent(saved)) {
        this.diagnostics.info('Paste', 'draft:restore', {
          context: this.contextKey(),
          source: draft ? 'draft' : handoff ? 'handoff' : 'autosave',
          target: saved.target ?? 'fedi',
          provider: saved.pasteProviderId ?? this.pasteProviders.default.id,
        });
        this.applySnapshot(saved);
      }
      if (handoff?.media?.length) {
        this.media.set(handoff.media);
      }
      if (handoff?.scheduleAt) {
        this.scheduleOpen.set(true);
        this.scheduleAt.set(handoff.scheduleAt);
      }
      if (draft) {
        // The draft moves into the composer (and its autosave slot).
        this.moveDraftToAutosave(draft.id);
      }
      this.restored = true;
      if (handoff?.publishImmediately) {
        // The writing wizard already ran every editable/review step and made
        // destination the final confirmation. Reopening confirmations here
        // would put "I made a mistake" decisions after that final choice.
        setTimeout(() => this.send());
      }
    });

    effect(() => this.previewOn.set(!this.compact()));

    this.seedDefaultLanguage();

    // Autosave (debounced) so a stray reload never eats a half-written post.
    effect(() => {
      const snapshot = this.snapshot();
      const key = this.contextKey();
      if (!this.restored) {
        return;
      }
      // The preview only needs the custom-emoji list once a :shortcode: shows up.
      if (snapshot.segments.some((s) => /:[a-z0-9_]+:/i.test(s))) {
        this.customEmojis.ensureLoaded();
      }
      if (this.autosaveTimer) {
        clearTimeout(this.autosaveTimer);
      }
      this.autosaveTimer = setTimeout(() => {
        this.autosaveTimer = null;
        const outcome = this.drafts.autosave(key, snapshot);
        this.draftSaveFailed.set(!outcome.durable);
      }, 500);
    });
  }

  /**
   * The self-draft this composer's text came from, if any.
   *
   * A post-to-self draft is a real status. Publishing it for real leaves the
   * private copy behind as a duplicate — the mastodon.social folk recipe deals
   * with that by deleting and re-drafting, which is destructive *before* the
   * post exists. We do the opposite: publish first, then offer to delete. That
   * way a failed publish can never destroy the only copy of the text.
   */
  private selfDraftOrigin: string | null = null;

  /** The self-draft copy the user is being asked about, after a successful post. */
  protected pendingSelfCleanup = signal<string | null>(null);
  protected selfCleanupError = signal<string | null>(null);

  /**
   * A real post went out. If its text came from a post-to-self draft, the
   * private copy is now a duplicate — ask whether to remove it.
   *
   * Called only where a `Status` actually exists. Not on a *scheduled* result
   * (nothing is published yet, so the copy is still the live version), and not
   * on a paste or a Bluesky post — pasting a private note somewhere public is
   * no reason to delete the private note.
   */
  private offerSelfCleanup(): void {
    if (this.selfDraftOrigin) {
      this.pendingSelfCleanup.set(this.selfDraftOrigin);
      this.selfDraftOrigin = null;
    }
  }

  /** Delete the private copy the just-published post came from. */
  deleteSelfDraftCopy(): void {
    const id = this.pendingSelfCleanup();
    this.pendingSelfCleanup.set(null);
    if (!id) {
      return;
    }
    this.api.deleteStatus(id).subscribe({
      error: () =>
        this.selfCleanupError.set(
          "The private draft copy couldn't be deleted — it's still in your messages.",
        ),
    });
  }

  private restored = false;
  /** The context+draft key the seed effect last applied; guards re-seeding. */
  private seededKey: string | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  protected cwOpen = signal(false);
  protected spoilerText = signal('');
  protected sensitive = signal(false);

  // Media.
  protected media = signal<PendingMedia[]>([]);
  /**
   * Why an attachment was refused or trimmed, when one was.
   *
   * Attached to the act of picking rather than left as ambient page text: the
   * old "Bluesky posts are text-only here" hint sat elsewhere on screen while
   * the submit button silently went dead, which is how a reader concludes the
   * attach button simply does not work.
   */
  protected mediaNotice = signal('');
  protected uploading = signal(false);

  // Scheduling. The value is a datetime-local string (browser-local time);
  // it's converted to ISO only when sending.
  protected scheduleOpen = signal(false);
  protected scheduleAt = signal('');
  /** A schedule only takes effect when the picker is open and holds a value. */
  protected scheduleActive = computed(() => this.scheduleOpen() && !!this.scheduleAt());
  /** Mastodon publishes immediately when scheduled_at is < ~5 min out. */
  protected scheduleTooSoon = computed(() => {
    if (!this.scheduleActive()) {
      return false;
    }
    const at = new Date(this.scheduleAt()).getTime();
    return !Number.isNaN(at) && at - Date.now() < 6 * 60_000;
  });
  /** "Scheduled for …" flash after a successful scheduled submit. */
  protected scheduledFlash = signal<string | null>(null);
  private scheduledFlashTimer: ReturnType<typeof setTimeout> | null = null;

  private flashScheduled(message: string): void {
    this.scheduledFlash.set(message);
    if (this.scheduledFlashTimer) {
      clearTimeout(this.scheduledFlashTimer);
    }
    this.scheduledFlashTimer = setTimeout(() => this.scheduledFlash.set(null), 8000);
  }

  toggleSchedule(): void {
    this.scheduleOpen.update((v) => !v);
    if (!this.scheduleOpen()) {
      this.scheduleAt.set('');
    }
  }

  /** min= for the picker: 10 minutes out, in datetime-local format. */
  protected scheduleMin(): string {
    const d = new Date(Date.now() + 10 * 60_000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  // Poll.
  protected pollOpen = signal(false);
  protected pollOptions = signal<string[]>(['', '']);
  protected pollMultiple = signal(false);
  protected pollExpiresIn = signal<number>(86400);

  /** Media and polls are mutually exclusive, matching Mastodon. */
  protected canAttachMedia = computed(
    () => !this.targetIncludesPaste() && !this.targetIncludesBlog() && !this.pollOpen(),
  );
  protected canAddPoll = computed(
    () => !this.targetIncludesPaste() && !this.targetIncludesBlog() && this.media().length === 0,
  );

  // Live preview (rendered like the feed will render it — not WYSIWYG).
  // Appears as soon as there's a character to render, gone when empty.
  // Compact composers start with it off; the 👁 toolbar button toggles it.
  protected previewOn = signal(true);
  private readonly previewSeed = signal('');
  protected previewVisible = computed(() => {
    const seed = this.previewSeed();
    return (
      this.previewOn() &&
      this.segments().some((segment, index) => {
        const content = segment.trim();
        return content !== '' && !(index === 0 && seed && seed.startsWith(content));
      })
    );
  });
  /** Compact mode hides the drafts picker behind a 📝 toolbar toggle. */
  protected draftsOpen = signal(false);
  protected previewHtml = computed(() =>
    this.segments().map((s) =>
      applyMinimalMarkdown(renderStatusText(s, this.customEmojis.emojis())),
    ),
  );

  // Emoji panel.
  protected emojiOpen = signal(false);
  /** The box (index + element) that last had focus, for emoji insertion. */
  private lastFocusedBox: { index: number; el: HTMLTextAreaElement } | null = null;

  // Post target (top-level composes only; replies/quotes always stay on Fedi).
  protected target = signal<PostTarget>(
    // A parked Hugo edit decides the target before anything else can: the user
    // clicked "Edit" on a specific file, so opening on Fedi would offer to post
    // their blog post as a toot.
    this.hugoEdit.editing()
      ? 'hugo'
      : // A caller that named a target picked it deliberately — the share dialog
        // asked "post it where?" and the user answered. Opening on anything else
        // would discard an answer they already gave. Validated through
        // `restorableTarget` so a target that stopped being usable between the
        // two screens falls back rather than showing an empty picker.
        this.initialTarget()
        ? restorableTarget(this.initialTarget() as PostTarget, this.availability.current())
        : this.auth.isAnonymous && this.featureFlags.enabled('pastebin')
          ? 'paste'
          : // A Bluesky-primary account posts to Bluesky by default. 'fedi' was
            // the unconditional fallback, which meant the one network the account
            // actually *is* opened un-selected: every quick post started aimed at
            // Mastodon, and posting where you live took a correction every time.
            //
            // Through `restorableTarget` rather than a bare 'bsky' so a session
            // whose Bluesky credentials have gone stale falls back instead of
            // opening on a target it cannot post to.
            this.auth.isBlueskyPrimary
            ? restorableTarget('bsky', this.availability.current())
            : 'fedi',
  );
  protected showTargetPicker = computed(() => !this.inReplyToId() && !this.quotedStatusId());
  protected targetIncludesBsky = computed(
    () => this.showTargetPicker() && (this.target() === 'bsky' || this.target() === 'both'),
  );
  /** Replies/quotes always use Fedi; top-level Fedi and Both targets include it. */
  protected targetIncludesFedi = computed(
    () => !this.showTargetPicker() || this.target() === 'fedi' || this.target() === 'both',
  );
  protected readonly bskyAudienceBlocked = computed(
    () => this.targetIncludesBsky() && this.visibility() !== 'public',
  );
  protected targetIncludesPaste = computed(
    () =>
      this.showTargetPicker() && this.target() === 'paste' && this.featureFlags.enabled('pastebin'),
  );
  /** Mataroa specifically: connected, flagged on, and selected. */
  protected targetIsMataroa = computed(
    () =>
      this.showTargetPicker() &&
      this.target() === 'blog' &&
      this.featureFlags.enabled('connector-mataroa') &&
      this.mataroa.connected(),
  );

  /** Blogger specifically: connected *with a blog chosen*, flagged on, selected. */
  protected targetIsBlogger = computed(
    () =>
      this.showTargetPicker() &&
      this.target() === 'blogger' &&
      this.featureFlags.enabled('connector-blogger') &&
      this.blogger.ready(),
  );

  /** Hugo: repo *and* token stored, flagged on, selected. */
  protected targetIsHugo = computed(
    () =>
      this.showTargetPicker() &&
      this.target() === 'hugo' &&
      this.featureFlags.enabled('connector-hugo') &&
      this.hugo.connected(),
  );

  /**
   * Any blog. This is what the *composer* cares about: every blog target takes
   * a title, and none of them take media or polls, regardless of which service
   * is behind it.
   */
  protected targetIncludesBlog = computed(
    () => this.targetIsMataroa() || this.targetIsBlogger() || this.targetIsHugo(),
  );

  /** Publish to Blogger as a draft rather than live. Ignored by other targets. */
  protected blogDraft = signal(false);
  protected pasteDisabledTarget = computed(
    () => this.target() === 'paste' && !this.featureFlags.enabled('pastebin'),
  );
  protected pasteProviderId = signal(this.pasteProviders.default.id);
  protected selectedPasteProvider = computed(
    () => this.pasteProviders.get(this.pasteProviderId()) ?? this.pasteProviders.default,
  );
  protected pasteLanguage = signal('plaintext');
  protected pasteExpiry = signal<PasteExpiry>('1w');
  protected pasteBytes = computed(() => new TextEncoder().encode(this.text()).byteLength);
  /**
   * Graphemes left under Bluesky's 300 limit for the *first* box (only
   * meaningful when posting there). Thread boxes are checked by
   * {@link overLimit}, which measures every segment.
   */
  protected bskyRemaining = computed(() => BSKY_MAX_GRAPHEMES - graphemeLength(this.text()));
  /** The Bluesky leg of a cross-post failed after the Fedi post went out. */
  protected crossPostError = signal<string | null>(null);
  /**
   * Why the server refused the post. Kept separate from crossPostError: this one
   * means nothing was published, so the text stays in the box for editing.
   */
  protected postError = signal<PostFailure | null>(null);

  /** Completed legs of the current, byte-for-byte unchanged publication retry. */
  private postingOperation: PostingOperation | null = null;

  protected dismissPostError(): void {
    this.postError.set(null);
  }

  /** Seconds left on the undo-send countdown, or null when no send is pending. */
  protected countdown = signal<number | null>(null);
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * The limit that actually applies to the box in front of the user.
   *
   * Mastodon allows 500 characters (counting every URL as 23 — see
   * {@link postLength}); Bluesky allows 300 *graphemes*. The composer used to
   * measure everything against 500 regardless of where it was going, so a
   * 400-character Bluesky post showed a comfortable "100 left" and was then
   * refused by the network.
   *
   * For `both` the lower limit binds, because one body goes to both services:
   * accepting 400 here would guarantee half the cross-post fails.
   */
  protected readonly effectiveMax = computed(() =>
    this.targetIncludesBsky() ? BSKY_MAX_GRAPHEMES : MAX_POST_CHARS,
  );

  /**
   * Which service's rule the current limit comes from, for the counter to name.
   * Only worth saying for `both`, where the number is smaller than the Mastodon
   * limit the user is looking at a Mastodon composer expecting.
   */
  protected readonly limitSource = computed(() => (this.target() === 'both' ? 'Bluesky' : ''));

  protected readonly maxChars = MAX_POST_CHARS;

  /**
   * The post's length as the *server* counts it, not as the string measures.
   *
   * Mastodon reserves a fixed width for every URL — see {@link postLength}. The
   * composer used to count raw characters, which meant pasting one ordinary
   * shopping link (they routinely run to several hundred characters of tracking
   * parameters) produced an over-limit warning for a post the server would have
   * accepted without comment.
   */
  protected countOf(text: string): number {
    return this.targetIncludesBsky() ? graphemeLength(text) : postLength(text);
  }

  /** The visible counter for the main box. */
  protected charCount = computed(() => this.countOf(this.text()));

  /** Any box over the limit blocks posting (no more silent auto-splitting). */
  protected overLimit = computed(() => {
    if (this.targetIncludesPaste()) {
      return this.pasteBytes() > MAX_PASTE_BYTES;
    }
    if (this.targetIncludesBlog()) {
      return false;
    }
    const max = this.effectiveMax();
    return this.segments().some((s) => this.countOf(s) > max);
  });

  /**
   * URLs long enough that shortening would visibly improve the post.
   *
   * Only ever about *appearance*: a 700-character URL already costs 23 against
   * the limit, so this never appears as a way to get back under budget. It
   * appears because a wall of `dib=eyJ2IjoiMSJ9...` in the middle of a sentence
   * is unpleasant to read and impossible to check before clicking.
   */
  protected longLinks = computed(() => longUrls(this.text()));

  /** Whether a shortener is connected and usable. */
  protected shortenerReady = this.linkShortening.ready;

  protected shortenerName = this.linkShortening.name;

  protected shortening = this.linkShortening.busy;
  protected shortenError = this.linkShortening.error;
  protected readonly shortenerConsentPrompt = this.linkShortening.consentPrompt;

  /** "Saved to drafts" flash after an explicit save. */
  protected draftSaved = signal(false);
  protected draftSaveFailed = signal(false);
  private draftSavedTimer: ReturnType<typeof setTimeout> | null = null;

  /** Attachments still lacking a description, by index. Shared rule, see alt-text.ts. */
  protected undescribedMedia = computed(() => undescribedIndexes(this.media()));

  /**
   * The advisory line about missing descriptions, or null when there is nothing
   * to say. Shown whether or not the user opted into the hard requirement —
   * accessibility advice is worth giving even when it is not enforced.
   */
  protected altTextNote = computed(() =>
    altTextMessage(this.undescribedMedia(), this.prefs.requireAltText()),
  );

  /**
   * Whether missing descriptions should actually block sending.
   *
   * Only when the user asked for that friction in Settings. Without the opt-in
   * the note above is advice and the send button stays live.
   */
  protected altTextMissing = computed(
    () => this.prefs.requireAltText() && this.undescribedMedia().length > 0,
  );

  protected canSubmit = computed(() => {
    if (this.pasteDisabledTarget()) {
      return false;
    }
    // A blog target that isn't actually usable (disconnected, flagged off, or
    // Blogger with no blog chosen) must not submit — it would post nowhere.
    if (isBlogTarget(this.target()) && !this.targetIncludesBlog()) {
      return false;
    }
    if (this.submitting() || this.uploading() || this.countdown() !== null) {
      return false;
    }
    if (this.overLimit() || this.altTextMissing()) {
      return false;
    }
    if (this.targetIncludesPaste()) {
      return (
        !!this.text().trim() &&
        !this.thread().some((text) => text.trim()) &&
        !this.media().length &&
        !this.pollOpen() &&
        !this.scheduleActive()
      );
    }
    if (this.targetIncludesBlog()) {
      return (
        !!this.spoilerText().trim() &&
        !!this.text().trim() &&
        !this.thread().some((text) => text.trim()) &&
        !this.media().length &&
        !this.pollOpen() &&
        !this.scheduleActive()
      );
    }
    if (this.scheduleActive()) {
      // Scheduling covers exactly one post: no threads, no Bluesky leg.
      if (this.thread().some((t) => t.trim()) || this.targetIncludesBsky()) {
        return false;
      }
    }
    if (this.targetIncludesBsky()) {
      // Threads are supported (posted as a chain of replies) and so are images,
      // so the only text rule is that the first box has something in it;
      // per-box length is already covered by `overLimit` above.
      if (this.bskyAudienceBlocked() || !this.text().trim()) {
        return false;
      }
      // Polls remain the one thing a Bluesky leg cannot carry — the protocol has
      // no poll record. Media used to be refused here too, which is what made
      // the submit button go dead with no explanation attached to it after
      // attaching a photo.
      if (this.target() === 'bsky' && this.pollOpen()) {
        return false;
      }
      return true;
    }
    const hasText = this.segments().some((s) => s.trim());
    const hasMedia = this.media().length > 0;
    const hasPoll = this.pollOpen() && this.pollOptions().filter((o) => o.trim()).length >= 2;
    return hasText || hasMedia || hasPoll;
  });

  /**
   * Narrow the visibility to what the paste target can express.
   *
   * Only applies while Paste is the live target: provider/expiry state is also
   * touched when a saved draft is restored ({@link applySnapshot}), and a fedi
   * draft saved as `private` must not be narrowed to `unlisted` just because
   * the composer set up its paste controls on the way past. The stash/restore
   * rules themselves live in {@link VisibilityState}.
   */
  private clampVisibilityForPaste(allowed: readonly string[]): void {
    this.visibilityState.clampFor(allowed, this.target() === 'paste');
  }

  /** Put back the visibility a paste clamp took away. */
  private restoreVisibility(): void {
    this.visibilityState.restore();
  }

  /** A hand-picked visibility is the user's real intent; forget what we stashed. */
  onVisibilityChange(visibility: string): void {
    this.visibilityState.choose(visibility);
  }

  onTargetChange(target: PostTarget): void {
    if (target === 'paste' && !this.featureFlags.enabled('pastebin')) {
      return;
    }
    if (
      target === 'blog' &&
      (!this.featureFlags.enabled('connector-mataroa') || !this.mataroa.connected())
    ) {
      return;
    }
    if (
      target === 'blogger' &&
      (!this.featureFlags.enabled('connector-blogger') || !this.blogger.ready())
    ) {
      return;
    }
    if (
      target === 'hugo' &&
      (!this.featureFlags.enabled('connector-hugo') || !this.hugo.connected())
    ) {
      return;
    }
    if (target !== 'hugo' && this.hugoEdit.editing()) {
      // Leaving Hugo abandons the edit rather than carrying it: a parked path
      // and sha that outlived the target would attach to whatever the user
      // writes next, and silently overwrite a file they had stopped thinking
      // about. The file itself is untouched either way.
      this.hugoEdit.cancel();
    }
    const wasPaste = this.target() === 'paste';
    this.target.set(target);
    this.noteBlueskyMediaLimits();
    if (isBlogTarget(target)) {
      // The CW box doubles as the post title for blogs, which every blog post
      // needs — so open it rather than making the user find it.
      this.cwOpen.set(true);
    } else {
      // Draft is a Blogger-only concept; leaving it set would silently apply to
      // nothing, and reappear as a surprise on the next blog post.
      this.blogDraft.set(false);
    }
    if (target === 'paste') {
      this.clampVisibilityForPaste(this.pasteVisibilities());
    } else if (wasPaste) {
      this.restoreVisibility();
    }
  }

  /**
   * What the selected provider allows, tightened to `unlisted` only for
   * burn-after-reading — a burn link that is also listed publicly defeats the
   * point of burning it.
   */
  private pasteVisibilities(): readonly string[] {
    return this.pasteExpiry() === 'burn' ? ['unlisted'] : this.selectedPasteProvider().visibilities;
  }

  onPasteProviderChange(providerId: string): void {
    const previousProviderId = this.pasteProviderId();
    const provider = this.pasteProviders.get(providerId) ?? this.pasteProviders.default;
    this.pasteProviderId.set(provider.id);
    if (!provider.languages.some((language) => language.value === this.pasteLanguage())) {
      this.pasteLanguage.set(provider.languages[0]?.value ?? 'plaintext');
    }
    if (!provider.expiries.some((expiry) => expiry.value === this.pasteExpiry())) {
      this.pasteExpiry.set(provider.expiries[0]?.value ?? '1w');
    }
    this.clampVisibilityForPaste(this.pasteVisibilities());
    this.diagnostics.info('Paste', 'provider:change', {
      requestedProvider: providerId,
      previousProvider: previousProviderId,
      selectedProvider: this.pasteProviderId(),
      language: this.pasteLanguage(),
      expiry: this.pasteExpiry(),
      visibility: this.visibility(),
    });
  }

  onPasteExpiryChange(expiry: PasteExpiry): void {
    const wasBurn = this.pasteExpiry() === 'burn';
    this.pasteExpiry.set(expiry);
    if (expiry === 'burn') {
      this.clampVisibilityForPaste(['unlisted']);
    } else if (wasBurn) {
      // Leaving burn widens the options again; give back what burn narrowed,
      // then re-clamp in case the provider itself doesn't allow it.
      this.restoreVisibility();
      this.clampVisibilityForPaste(this.pasteVisibilities());
    }
  }

  // --- links ---

  /**
   * Replace every long URL in the main box with a short one.
   *
   * Never automatic. Shortening rewrites what the reader sees and spends a link
   * from the user's monthly quota, and — more to the point — a short link hides
   * where it goes, which is the user's call to make about their own post and not
   * something a composer should do behind their back while they type.
   *
   * Replacements are applied back-to-front so that each splice does not shift
   * the offsets of the ones not yet done.
   */
  protected async shortenLinks(): Promise<void> {
    const shortened = await this.linkShortening.shorten(this.text());
    if (shortened !== null) {
      this.text.set(shortened);
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

  // --- thread boxes ---

  addThreadBox(): void {
    this.thread.update((list) => [...list, '']);
  }

  setThreadText(index: number, value: string): void {
    this.thread.update((list) => list.map((t, i) => (i === index ? value : t)));
  }

  removeThreadBox(index: number): void {
    this.thread.update((list) => list.filter((_, i) => i !== index));
  }

  /** Remember which box has focus so emoji insertion lands in the right place. */
  onBoxFocus(index: number, event: FocusEvent): void {
    this.lastFocusedBox = { index, el: event.target as HTMLTextAreaElement };
  }

  /** Mastodon-compatible keys inside the box: ctrl/⌘+enter sends, alt+x toggles CW. */
  onBoxKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.submit();
    } else if (event.altKey && event.code === 'KeyX') {
      event.preventDefault();
      this.toggleCw();
    } else if (event.key === 'Escape') {
      (event.target as HTMLTextAreaElement).blur();
    }
  }

  // --- emoji ---

  toggleEmoji(): void {
    this.emojiOpen.update((v) => !v);
    if (this.emojiOpen()) {
      this.customEmojis.ensureLoaded();
    }
  }

  /** Insert picked emoji text at the caret of the last-focused box. */
  insertEmoji(emojiText: string): void {
    const box = this.lastFocusedBox ?? { index: 0, el: null };
    const current = box.index === 0 ? this.text() : (this.thread()[box.index - 1] ?? '');
    const start = box.el?.selectionStart ?? current.length;
    const end = box.el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + emojiText + current.slice(end);
    if (box.index === 0) {
      this.text.set(next);
    } else {
      this.setThreadText(box.index - 1, next);
    }
    // Put the caret right after the inserted emoji.
    const el = box.el;
    if (el) {
      setTimeout(() => {
        el.focus();
        const caret = start + emojiText.length;
        el.setSelectionRange(caret, caret);
      });
    }
  }

  toggleCw(): void {
    this.cwOpen.update((v) => !v);
    if (!this.cwOpen()) {
      this.spoilerText.set('');
    }
  }

  // --- post language ---

  /**
   * Seed the picker from the account's posting-default language, but only if
   * that language is one we'd offer (i.e. in the known set). Reads the already
   * loaded credential account (`source.language`) — no extra request — so it
   * costs nothing and stays "Not specified" when there's no default. Runs once.
   */
  private seedDefaultLanguage(): void {
    if (this.seededLanguage) {
      return;
    }
    this.seededLanguage = true;
    const def = this.auth.account()?.source?.language?.toLowerCase().split(/[-_]/)[0] ?? '';
    if (def && this.knownLanguages.knows(def)) {
      this.postLanguage.set(def);
    }
  }

  onLanguageChange(code: string): void {
    this.postLanguage.set(code);
    // Changing the picker clears any standing mismatch warning, and any prior
    // dismissal — the user picked a new language, so re-check against it.
    this.langMismatch.set(null);
    this.dismissedMismatch.set(null);
  }

  languageName(code: string): string {
    return LANG_NAMES[code as LangCode] ?? code.toUpperCase();
  }

  /**
   * A *confident* language for the composed body, or null when it's too short or
   * ambiguous to tell. Mirrors the feed filter's confidence bar so the warning
   * only fires when detection is actually sure — we don't nag on a "hi".
   */
  private detectedLanguage(): string | null {
    const text = this.segments()
      .map((s) => stripHtml(s))
      .join(' ')
      .trim();
    if (text.length < 20) {
      return null;
    }
    return confidentLanguage(text);
  }

  /**
   * Post anyway despite the language mismatch (keeps the user's picked value).
   *
   * Resumes at {@link finishSubmit} rather than calling `send()`, so clearing
   * one warning cannot skip the PKM one behind it.
   */
  confirmLanguageAndSend(): void {
    this.langMismatch.set(null);
    this.finishSubmit();
  }

  /** Adopt the detected language into the picker and dismiss the warning. */
  useDetectedLanguage(): void {
    const detected = this.langMismatch()?.detected;
    if (detected) {
      this.postLanguage.set(detected);
    }
    this.langMismatch.set(null);
    this.dismissedMismatch.set(null);
  }

  /** Publish anyway, knowing it carries a note or to-do tag. */
  confirmPkmAndSend(): void {
    // Left set while `finishSubmit` re-runs, so the check reads "already warned"
    // and falls through instead of raising the same dialog again.
    this.finishSubmit();
    this.pkmWarning.set(null);
  }

  /** Go back to editing — the usual outcome, and the default. */
  dismissPkmWarning(): void {
    this.pkmWarning.set(null);
  }

  /** How to name the kinds in the warning ("a to-do", "a note and a to-do"). */
  protected pkmWarningLabel(): string {
    const vocab = this.prefs.pkmVocabulary();
    const kinds = this.pkmWarning() ?? [];
    return kinds.map((kind) => pkmLabel(kind, vocab)).join(' and ');
  }

  /**
   * Close the warning without changing anything and go back to editing. Records
   * the pair so it doesn't immediately re-raise on the next Post; the user can
   * keep their picked language and post when ready, or edit the text (which
   * re-detects and, if it now reads as something else, warns afresh).
   */
  dismissLangMismatch(): void {
    this.dismissedMismatch.set(this.langMismatch());
    this.langMismatch.set(null);
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.uploadFiles(files);
  }

  /** Pasting an image (screenshot, copied file) attaches it; plain text pastes normally. */
  onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    const media = files.filter((f) => isAttachable(f));
    if (!media.length) {
      return;
    }
    event.preventDefault();
    this.uploadFiles(media);
  }

  // Drag & drop anywhere on the composer attaches the dropped files.
  // Depth-counted because dragenter/leave also fire on every child element.
  protected dragOver = signal(false);
  private dragDepth = 0;

  onDragEnter(event: DragEvent): void {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    this.dragDepth++;
    this.dragOver.set(this.canAttachMedia());
  }

  onDragOver(event: DragEvent): void {
    if (dragHasFiles(event)) {
      // Without this the browser navigates to the dropped file.
      event.preventDefault();
    }
  }

  onDragLeave(_event: DragEvent): void {
    if (this.dragDepth > 0 && --this.dragDepth === 0) {
      this.dragOver.set(false);
    }
  }

  onDrop(event: DragEvent): void {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    this.dragDepth = 0;
    this.dragOver.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => isAttachable(f));
    this.uploadFiles(files);
  }

  /**
   * Say what a Bluesky leg will do with what is already attached.
   *
   * Switching target after attaching is the case the pick-time check cannot
   * cover: four photos and a video are fine on Fedi, and become a problem the
   * moment Bluesky joins the destinations. Said here, when the target changes,
   * rather than discovered at submit.
   */
  private noteBlueskyMediaLimits(): void {
    if (!this.targetIncludesBsky() || !this.media().length) {
      this.mediaNotice.set('');
      return;
    }
    const attached = this.media();
    const nonImage = attached.filter((m) => m.file && !isBlueskyAttachable(m.file)).length;
    const overflow = Math.max(0, attached.length - BSKY_MAX_IMAGES);
    this.mediaNotice.set(
      nonImage
        ? 'Bluesky takes images only — the rest will go to Fedi alone.'
        : overflow
          ? `Bluesky takes ${BSKY_MAX_IMAGES} images per post — the first ${BSKY_MAX_IMAGES} will go.`
          : '',
    );
  }

  /** In-flight uploads; `uploading` stays true until the last one settles. */
  private pendingUploads = 0;

  private uploadFiles(files: File[]): void {
    if (!this.canAttachMedia() || !files.length) {
      return;
    }
    // Where Bluesky is a destination, its narrower rules bind: images only, four
    // at most. Saying so at the point of picking beats letting a video ride
    // along and fail at submit, or silently dropping it.
    if (this.targetIncludesBsky()) {
      const rejected = files.filter((f) => !isBlueskyAttachable(f));
      files = files.filter(isBlueskyAttachable);
      const room = BSKY_MAX_IMAGES - this.media().length;
      const overflow = Math.max(0, files.length - Math.max(0, room));
      files = files.slice(0, Math.max(0, room));
      this.mediaNotice.set(
        rejected.length
          ? 'Bluesky posts take images only — video and audio were left out.'
          : overflow
            ? `Bluesky takes ${BSKY_MAX_IMAGES} images per post — the extra ${overflow === 1 ? 'one was' : `${overflow} were`} left out.`
            : '',
      );
      if (!files.length) {
        return;
      }
    } else {
      this.mediaNotice.set('');
    }
    for (const file of files) {
      // Bluesky-only: there is no Mastodon post to attach this to, so uploading
      // it there would spend a call and store a file nothing will reference.
      // Held locally instead and sent to Bluesky at submit time, which is when
      // the blob has to exist in that repo anyway.
      if (this.target() === 'bsky') {
        this.media.update((list) => [...list, { media: localMedia(file), description: '', file }]);
        continue;
      }
      this.pendingUploads++;
      this.uploading.set(true);
      this.api.uploadMedia(file).subscribe({
        next: (media) => {
          this.media.update((list) => [...list, { media, description: '', file }]);
          this.settleUpload();
        },
        error: () => this.settleUpload(),
      });
    }
  }

  private settleUpload(): void {
    if (--this.pendingUploads <= 0) {
      this.pendingUploads = 0;
      this.uploading.set(false);
    }
  }

  setMediaDescription(index: number, description: string): void {
    this.media.update((list) => list.map((m, i) => (i === index ? { ...m, description } : m)));
  }

  removeMedia(index: number): void {
    this.media.update((list) => {
      const going = list[index];
      if (going) {
        releaseLocalMedia(going.media);
      }
      return list.filter((_, i) => i !== index);
    });
  }

  togglePoll(): void {
    this.pollOpen.update((v) => !v);
    if (!this.pollOpen()) {
      this.pollOptions.set(['', '']);
      this.pollMultiple.set(false);
    }
  }

  setPollOption(index: number, value: string): void {
    this.pollOptions.update((opts) => opts.map((o, i) => (i === index ? value : o)));
  }

  addPollOption(): void {
    if (this.pollOptions().length < 4) {
      this.pollOptions.update((opts) => [...opts, '']);
    }
  }

  removePollOption(index: number): void {
    if (this.pollOptions().length > 2) {
      this.pollOptions.update((opts) => opts.filter((_, i) => i !== index));
    }
  }

  // --- drafts ---

  /** 'new', 'reply:<id>' or 'quote:<id>' — each context autosaves separately. */
  private contextKey(): string {
    const reply = this.inReplyToId();
    if (reply) {
      return `reply:${reply}`;
    }
    const quote = this.quotedStatusId();
    if (quote) {
      return `quote:${quote}`;
    }
    return 'new';
  }

  /**
   * Whether this composer should pick up a pending "Edit for post" handoff.
   *
   * Only a top-level composer. Dropping a drafted post into a reply or quote box
   * would attach it to a conversation the user never chose — and with several
   * composers alive at once (a thread page mounts one per card), the first one
   * to seed would silently swallow it.
   */
  private acceptsHandoff(): boolean {
    return this.contextKey() === 'new';
  }

  private snapshot(): DraftSnapshot {
    return {
      segments: this.segments(),
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
      inReplyToId: this.inReplyToId(),
      quotedStatusId: this.quotedStatusId(),
      target: this.target(),
      pasteProviderId: this.pasteProviderId(),
      pasteLanguage: this.pasteLanguage(),
      pasteExpiry: this.pasteExpiry(),
    };
  }

  /**
   * What is linked, flagged on and signed in right now, as plain data.
   *
   * The rules that read it live in `post-targets.ts` so the publish wizard can
   * ask the same question without acquiring all of these providers — and, more
   * to the point, so it cannot offer a destination this composer would refuse.
   */
  targetAvailability(): TargetAvailability {
    // Gathered by TargetAvailabilitySource so the share dialog asks the same
    // question of the same state — two snapshots would drift, and the dialog
    // would offer a destination this composer then refuses.
    return this.availability.current();
  }

  /** See {@link restorableTarget} — the rule itself is shared, not duplicated. */
  private restorableTarget(target: PostTarget): PostTarget {
    return restorableTarget(target, this.targetAvailability());
  }

  private applySnapshot(d: DraftSnapshot): void {
    this.text.set(d.segments[0] ?? '');
    this.thread.set(d.segments.slice(1));
    this.spoilerText.set(d.spoilerText);
    this.cwOpen.set(!!d.spoilerText);
    this.sensitive.set(d.sensitive);
    this.postLanguage.set(d.postLanguage ?? '');
    if (!this.lockVisibility()) {
      // A saved draft's visibility is a real choice, so it outranks anything a
      // paste clamp stashed on the way here.
      this.visibilityState.choose(d.visibility);
    }
    this.target.set(this.restorableTarget(d.target ?? 'fedi'));
    this.onPasteProviderChange(d.pasteProviderId ?? this.pasteProviders.default.id);
    const provider = this.selectedPasteProvider();
    this.pasteLanguage.set(
      provider.languages.some((language) => language.value === d.pasteLanguage)
        ? (d.pasteLanguage ?? 'plaintext')
        : (provider.languages[0]?.value ?? 'plaintext'),
    );
    const expiry = (d.pasteExpiry as PasteExpiry | undefined) ?? '1w';
    this.pasteExpiry.set(
      provider.expiries.some((option) => option.value === expiry)
        ? expiry
        : (provider.expiries[0]?.value ?? '1w'),
    );
    if (d.poll) {
      this.pollOpen.set(true);
      this.pollOptions.set(d.poll.options.length >= 2 ? d.poll.options : ['', '']);
      this.pollMultiple.set(d.poll.multiple);
      this.pollExpiresIn.set(d.poll.expiresIn);
    } else {
      this.pollOpen.set(false);
      this.pollOptions.set(['', '']);
      this.pollMultiple.set(false);
    }
  }

  /** True when there's anything a draft could keep. */
  protected hasDraftContent = computed(
    () =>
      this.segments().some((s) => s.trim()) || (this.cwOpen() && this.spoilerText().trim() !== ''),
  );

  /** The saved-drafts list, for the picker dropdown. */
  protected savedDrafts = this.drafts.drafts;

  /** Short label for a draft in the picker. */
  draftLabel(d: Draft): string {
    const text = d.segments.find((s) => s.trim()) ?? '';
    const snippet = text.trim().replace(/\s+/g, ' ');
    if (snippet) {
      return snippet.length > 32 ? snippet.slice(0, 32) + '…' : snippet;
    }
    return d.poll ? '(poll draft)' : '(empty draft)';
  }

  /**
   * The drafts dropdown: save the current text as a draft, or load one.
   * Loading swaps — anything half-written is saved as a draft first, so
   * picking a draft never loses work.
   */
  onDraftSelect(select: HTMLSelectElement): void {
    const value = select.value;
    select.value = '';
    if (value === 'save') {
      this.saveDraft();
      return;
    }
    const draft = this.drafts.get(value);
    if (!draft) {
      return;
    }
    if (draftHasContent(this.snapshot())) {
      const outcome = this.drafts.save(this.snapshot());
      if (!outcome.durable) {
        this.draftSaveFailed.set(true);
        return;
      }
    }
    this.applySnapshot(draft);
    this.moveDraftToAutosave(draft.id);
  }

  /** Keep the named copy until the opened editor has a durable autosave. */
  private moveDraftToAutosave(id: string): void {
    if (!this.drafts.autosave(this.contextKey(), this.snapshot()).durable) {
      this.draftSaveFailed.set(true);
      return;
    }
    if (!this.drafts.remove(id).durable) {
      this.crossPostError.set(this.transloco.translate('drafts.removeFailed'));
    }
  }

  /** Move the current composer state into the drafts list and clear the box. */
  saveDraft(): void {
    const snapshot = this.snapshot();
    if (!draftHasContent(snapshot)) {
      return;
    }
    const outcome = this.drafts.save(snapshot);
    if (!outcome.durable) {
      // This editor is now the only copy. Leave every field intact and make the
      // non-durable state explicit instead of displaying the success flash.
      this.draftSaved.set(false);
      this.draftSaveFailed.set(true);
      return;
    }
    this.draftSaveFailed.set(false);
    this.reset();
    this.draftSaved.set(true);
    if (this.draftSavedTimer) {
      clearTimeout(this.draftSavedTimer);
    }
    this.draftSavedTimer = setTimeout(() => this.draftSaved.set(false), 4000);
  }

  /** Download the current editor without depending on browser storage. */
  downloadDraft(): void {
    const payload = JSON.stringify(this.snapshot(), null, 2);
    const anchor = document.createElement('a');
    anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`;
    anchor.download = `mockingbird-draft-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
  }

  private flushAutosave(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      this.drafts.autosave(this.contextKey(), this.snapshot());
    }
    if (this.draftSavedTimer) {
      clearTimeout(this.draftSavedTimer);
    }
    if (this.scheduledFlashTimer) {
      clearTimeout(this.scheduledFlashTimer);
    }
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    // Enforced here, not just in the template. The gate is the feature — a
    // hotkey, an Enter handler, or a future call site must not be able to
    // publish around it. Saving is what this composer does instead.
    if (this.gated()) {
      this.saveDraft();
      return;
    }
    // Language sanity check: if the user picked a specific language and the text
    // confidently reads as a *different* one, pause and let them fix it or post
    // anyway. Only fires when both are known and disagree — never on unsure text
    // or "Not specified". Skipped for paste/Bluesky targets (no fedi language).
    if (
      this.postLanguage() &&
      !this.targetIncludesPaste() &&
      !this.targetIncludesBlog() &&
      !this.targetIncludesBsky()
    ) {
      const detected = this.detectedLanguage();
      const dismissed = this.dismissedMismatch();
      const alreadyDismissed =
        dismissed?.picked === this.postLanguage() && dismissed?.detected === detected;
      if (
        detected &&
        detected !== this.postLanguage() &&
        this.langMismatch() === null &&
        !alreadyDismissed
      ) {
        this.langMismatch.set({ picked: this.postLanguage(), detected });
        return;
      }
    }
    this.finishSubmit();
  }

  /**
   * The tail of {@link submit}, after the language check.
   *
   * Split out because "post anyway despite the language warning" resumes here —
   * if it called `send()` directly it would skip the PKM warning below, and a
   * user who hit one warning would silently miss the other.
   */
  private finishSubmit(): void {
    // A note to yourself and a post to your followers look identical in this
    // box. Checked here rather than in the template for the same reason the
    // gate above is: a hotkey or a future call site must not publish around it.
    if (this.prefs.warnOnPkmPublish() && this.pkmWarning() === null) {
      const kinds = pkmKinds(this.segments().join('\n'), this.prefs.pkmVocabulary());
      if (kinds.length) {
        this.pkmWarning.set(kinds);
        return;
      }
    }
    if (this.prefs.confirmBeforePost() && !confirm('Do you really want to post that?')) {
      return;
    }
    if (this.prefs.delayedSend()) {
      this.countdown.set(30);
      this.countdownTimer = setInterval(() => {
        const left = (this.countdown() ?? 1) - 1;
        if (left <= 0) {
          this.clearCountdown();
          this.send();
        } else {
          this.countdown.set(left);
        }
      }, 1000);
      return;
    }
    this.send();
  }

  /** Abort a pending undo-send countdown, keeping the draft intact. */
  cancelSend(): void {
    this.clearCountdown();
  }

  /** Skip the rest of a pending countdown and post immediately. */
  publishNow(): void {
    if (this.countdown() === null) {
      return;
    }
    this.clearCountdown();
    this.send();
  }

  private clearCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdown.set(null);
  }

  private send(): void {
    if (this.overLimit()) {
      this.crossPostError.set(
        'A thread post is too long. Shorten it before publishing; nothing new was sent.',
      );
      return;
    }
    // Recheck after the undo-send timer: the audience may have changed since submit.
    if (this.bskyAudienceBlocked()) {
      return;
    }
    if (this.target() === 'paste' && !this.featureFlags.enabled('pastebin')) {
      this.crossPostError.set('Pastebin is disabled in Feature flags.');
      return;
    }
    this.submitting.set(true);
    this.crossPostError.set(null);
    this.postError.set(null);

    if (this.targetIncludesPaste()) {
      this.sendToPaste();
      return;
    }
    if (isBlogTarget(this.target()) && !this.targetIncludesBlog()) {
      this.submitting.set(false);
      this.crossPostError.set(RECONNECT_BLOG_MESSAGE[this.target() as BlogTarget]);
      return;
    }

    if (this.targetIsBlogger()) {
      this.sendToBlogger();
      return;
    }

    if (this.targetIsHugo()) {
      this.sendToHugo();
      return;
    }

    if (this.targetIncludesBlog()) {
      this.sendToBlog();
      return;
    }

    // Mastodon stores descriptions on the media object, separately from the
    // status that attaches it. Status creation must therefore wait for every
    // description write: a detached subscription here used to let immediate,
    // scheduled, and cross-posted statuses race ahead without their alt text.
    // Bluesky-only attachments are local objects and carry their description in
    // the embed, so they do not have Mastodon metadata to persist.
    const publication = this.postingFingerprint(this.timelineTarget());
    const sendUnchanged = () => {
      if (this.destroyed) return;
      if (
        this.bskyAudienceBlocked() ||
        publication !== this.postingFingerprint(this.timelineTarget())
      ) {
        this.submitting.set(false);
        this.crossPostError.set(this.transloco.translate('compose.changedBeforePublish'));
        return;
      }
      this.sendTimeline();
    };
    const descriptions = this.targetIncludesFedi()
      ? this.media().filter((item) => !isLocalMedia(item.media) && item.description.trim())
      : [];
    if (descriptions.length) {
      forkJoin(
        descriptions.map((item) => this.api.updateMedia(item.media.id, item.description.trim())),
      ).subscribe({
        next: sendUnchanged,
        error: (error: unknown) => {
          this.submitting.set(false);
          const failure = describePostFailure(error);
          this.postError.set({
            ...failure,
            message: `Couldn't save the attachment descriptions, so nothing was posted. Your post and attachments are still here — try again. ${failure.message}`,
          });
        },
      });
      return;
    }

    sendUnchanged();
  }

  /** Publish a timeline post after all required Mastodon media writes finish. */
  private sendTimeline(): void {
    const options: ComposeOptions = {
      inReplyToId: this.inReplyToId(),
      quotedStatusId: this.quotedStatusId(),
      visibility: this.visibility(),
    };
    if (this.postLanguage()) {
      options.language = this.postLanguage();
    }
    if (this.cwOpen() && this.spoilerText().trim()) {
      options.spoilerText = this.spoilerText().trim();
    }
    if (this.sensitive()) {
      options.sensitive = true;
    }
    if (this.media().length) {
      options.mediaIds = this.media().map((m) => m.media.id);
    }
    if (this.pollOpen()) {
      const pollOpts = this.pollOptions()
        .map((o) => o.trim())
        .filter(Boolean);
      if (pollOpts.length >= 2) {
        options.poll = {
          options: pollOpts,
          expiresIn: this.pollExpiresIn(),
          multiple: this.pollMultiple(),
        };
      }
    }

    if (this.scheduleActive()) {
      options.scheduledAt = new Date(this.scheduleAt()).toISOString();
    }

    const posts = this.segments()
      .map((s) => s.trim())
      .filter((s, i) => i === 0 || s !== '');
    const operation = this.operationFor(posts, options);
    if (!operation) {
      this.submitting.set(false);
      return;
    }

    // Each destination owns its own progress. A retry starts only the missing
    // leg/segment, while an edit changes the fingerprint and starts a fresh
    // operation with fresh Mastodon idempotency keys.
    if (operation.target !== 'fedi' && !operation.bsky.complete) {
      this.sendToBluesky(operation);
    }
    if (operation.target !== 'bsky' && !operation.fedi.complete) {
      this.postFediPart(operation);
    }
    this.settlePosting(operation);
  }

  private timelineTarget(): PostingOperation['target'] {
    return this.targetIncludesBsky() ? (this.targetIncludesFedi() ? 'both' : 'bsky') : 'fedi';
  }

  private operationFor(parts: string[], options: ComposeOptions): PostingOperation | null {
    const target = this.timelineTarget();
    const fingerprint = this.postingFingerprint(target);
    if (this.postingOperation?.fingerprint === fingerprint) {
      return this.postingOperation;
    }
    const previous = this.postingOperation;
    const completed = previous
      ? Math.max(previous.fedi.statuses.length, previous.bsky.parts.length)
      : 0;
    if (previous && completed) {
      const withoutText = (value: string): string => {
        const parsed = JSON.parse(value) as { draft: { segments: string[] } };
        parsed.draft.segments = [];
        return JSON.stringify(parsed);
      };
      if (
        withoutText(previous.fingerprint) !== withoutText(fingerprint) ||
        previous.parts.slice(0, completed).some((part, index) => part !== parts[index])
      ) {
        this.crossPostError.set(
          'This thread has already started. Keep published posts, attachments, account and destination unchanged; edit only unfinished posts to resume.',
        );
        return null;
      }
      parts.forEach((part, index) => {
        if (part !== previous.parts[index]) previous.bsky.preparedFacets[index] = undefined;
      });
      previous.parts = parts;
      previous.fingerprint = fingerprint;
      return previous;
    }
    const operation: PostingOperation = {
      id: crypto.randomUUID(),
      fingerprint,
      target,
      parts,
      options: { ...options },
      scheduledFor: options.scheduledAt ? new Date(options.scheduledAt) : null,
      fedi: {
        statuses: [],
        complete: false,
        inFlight: false,
        failure: null,
      },
      bsky: {
        parts: [],
        createdAt: [],
        preparedFacets: [],
        complete: false,
        inFlight: false,
        failedAt: null,
      },
    };
    this.postingOperation = operation;
    return operation;
  }

  private postingFingerprint(target: PostingOperation['target']): string {
    const media = this.media().map((item) => ({
      id: item.media.id,
      description: item.description,
      file: item.file
        ? {
            name: item.file.name,
            size: item.file.size,
            type: item.file.type,
            lastModified: item.file.lastModified,
          }
        : null,
    }));
    return JSON.stringify({
      target,
      draft: this.snapshot(),
      scheduleAt: this.scheduleActive() ? this.scheduleAt() : '',
      media,
      fediIdentity: {
        server: this.server.baseUrl(),
        accountId: this.auth.account()?.id ?? null,
      },
      bskyDid: this.bskySession.session()?.did ?? null,
    });
  }

  /** Publish the next missing Mastodon segment using its stable operation key. */
  private postFediPart(operation: PostingOperation): void {
    if (operation.fedi.inFlight || operation.fedi.complete) return;
    const index = operation.fedi.statuses.length;
    const previous = operation.fedi.statuses[index - 1];
    const options: ComposeOptions =
      index === 0
        ? operation.options
        : { inReplyToId: previous.id, visibility: operation.options.visibility };
    operation.fedi.inFlight = true;
    this.api
      .postStatus(operation.parts[index], options, `${operation.id}:fedi:${index}`)
      .subscribe({
        next: (status) => {
          operation.fedi.inFlight = false;
          operation.fedi.failure = null;
          operation.fedi.statuses.push(status);
          if (operation.fedi.statuses.length < operation.parts.length) {
            this.postFediPart(operation);
            return;
          }
          operation.fedi.complete = true;
          this.showPostingFailure(operation);
          this.settlePosting(operation);
        },
        error: (error: unknown) => {
          operation.fedi.inFlight = false;
          operation.fedi.failure = describePostFailure(error);
          this.showPostingFailure(operation);
          this.settlePosting(operation);
        },
      });
  }

  private sendToPaste(): void {
    const provider = this.selectedPasteProvider();
    const visibility =
      this.pasteExpiry() !== 'burn' && provider.visibilities.includes('public')
        ? this.visibility() === 'public'
          ? 'public'
          : 'unlisted'
        : 'unlisted';
    const input = {
      title: this.cwOpen() ? this.spoilerText().trim() : '',
      content: this.text().trim(),
      language: this.pasteLanguage(),
      expiry: this.pasteExpiry(),
      visibility,
    } as const;
    this.diagnostics.info('Paste', 'create:start', {
      provider: provider.id,
      selectedProvider: this.pasteProviderId(),
      bytes: new TextEncoder().encode(input.content).byteLength,
      visibility: input.visibility,
    });
    provider.create(input).subscribe({
      next: (created) => {
        this.diagnostics.info('Paste', 'create:success', {
          provider: provider.id,
          url: created.url,
        });
        this.pasteHistory.add(provider.id, provider.label, input, created);
        // The paste went out; if localStorage couldn't retain the link, say so
        // now — it's the one moment the user can still copy it.
        const persistError = this.pasteHistory.persistError();
        if (persistError) {
          this.crossPostError.set(
            `${provider.label} paste created (${created.url}). ${persistError}`,
          );
        }
        this.reset();
        this.posted.emit(
          provider.status({
            slug: created.slug,
            title: input.title || null,
            language: input.language,
            preview: input.content,
            createdAt: new Date().toISOString(),
            url: created.url,
            rawUrl: created.rawUrl,
          }),
        );
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        const { status, hint } = describePasteFailure(error);
        this.diagnostics.error('Paste', 'create:error', error, {
          provider: provider.id,
          httpStatus: status,
          hint,
        });
        // status 0 is the browser hiding a CORS/network failure — the service is
        // likely down or not sending CORS headers, which "try again" won't fix.
        this.crossPostError.set(
          status === 0
            ? `Couldn't reach ${provider.label} (blocked or unreachable — the service may be down). Try a different paste service.`
            : `Couldn't create the ${provider.label} paste${status ? ` (HTTP ${status})` : ''} — try again.`,
        );
      },
    });
  }

  /**
   * Publish to Blogger.
   *
   * The body is rendered to HTML with the same minimal-markdown pass the
   * composer previews with, so what the user saw is what the blog gets. Blogger
   * stores HTML natively, unlike Mataroa which takes Markdown — hence the two
   * separate methods rather than one with a flag.
   */
  private async sendToBlogger(): Promise<void> {
    const title = this.spoilerText().trim();
    const body = this.text().trim();
    const account = this.auth.account();
    const blogId = this.blogger.blogId();
    if (!account || !blogId) {
      this.submitting.set(false);
      this.crossPostError.set(
        account ? 'Choose which blog to publish to in Settings.' : 'Sign in before publishing.',
      );
      return;
    }
    const isDraft = this.blogDraft();
    try {
      const created = await this.bloggerApi.createPost({
        blogId,
        title,
        content: applyMinimalMarkdown(body),
        isDraft,
      });
      const blogName = this.blogger.blogName();
      this.reset();
      this.posted.emit(bloggerStatus(created, title, body, account, { isDraft, blogName }));
    } catch (error: unknown) {
      this.submitting.set(false);
      this.crossPostError.set(
        error instanceof Error ? error.message : "Blogger couldn't publish this post.",
      );
    }
  }

  /**
   * Publish to a Hugo site by committing a Markdown file to its repository.
   *
   * The body goes up as the Markdown the user typed, not as rendered HTML —
   * the opposite of `sendToBlogger`, and for a good reason: Hugo renders
   * Markdown itself at build time, so pre-rendering here would both duplicate
   * that work and throw away the source the user would later want to edit.
   */
  private async sendToHugo(): Promise<void> {
    const account = this.auth.account();
    if (!account) {
      this.submitting.set(false);
      this.crossPostError.set('Sign in before publishing to your blog.');
      return;
    }
    const title = this.spoilerText().trim();
    const body = this.text().trim();
    const edit = this.hugoEdit.current();
    const isDraft = this.blogDraft();
    try {
      if (edit) {
        // Rewriting a file that already exists: same path, same date, same
        // unknown front-matter keys, new sha afterwards.
        const result = await this.hugoPublish.update({
          title,
          body,
          isDraft,
          edit,
        });
        this.hugoEdit.finish();
        this.reset();
        this.watchHugoBuild(result.commit.commitSha, isDraft);
        this.posted.emit(
          hugoStatus(result.commit, title, body, account, {
            slug: result.slug,
            permalink: this.hugo.permalinkFor(result.slug),
            isDraft,
          }),
        );
        return;
      }
      const result = await this.hugoPublish.publish({
        title,
        body,
        isDraft,
        account,
      });
      this.reset();
      this.watchHugoBuild(result.commit.commitSha, isDraft);
      this.posted.emit(result.status);
    } catch (error: unknown) {
      this.submitting.set(false);
      this.crossPostError.set(
        error instanceof HugoApiError && error.status === 409
          ? 'This post changed on GitHub since you opened it. Reopen it from Settings to get the current version — publishing now would overwrite that change.'
          : error instanceof Error
            ? error.message
            : "Your Hugo repository couldn't accept this post.",
      );
    }
  }

  /** Abandon an in-progress Hugo edit, leaving the file untouched. */
  cancelHugoEdit(): void {
    this.hugoEdit.cancel();
    this.reset();
  }

  /**
   * Follow the commit through its GitHub Actions build.
   *
   * Called *after* the post has been emitted, never before, and its failure can
   * never affect the publish — the commit already succeeded and the writing is
   * safe in the repo whatever Actions goes on to do. That ordering is the whole
   * safety property of this feature.
   *
   * A Hugo draft is committed but deliberately not built into the site, so
   * there is no build to watch and a "still building…" chip would never resolve.
   */
  private watchHugoBuild(commitSha: string, isDraft: boolean): void {
    if (isDraft || !commitSha) {
      this.deployWatch.stop();
      return;
    }
    this.deployWatch.watch(commitSha);
  }

  private sendToBlog(): void {
    const title = this.spoilerText().trim();
    const body = this.text().trim();
    const account = this.auth.account();
    if (!account) {
      this.submitting.set(false);
      this.crossPostError.set('Sign in before publishing to your blog.');
      return;
    }
    this.mataroaApi.createPost(title, body).subscribe({
      next: (created) => {
        this.reset();
        this.posted.emit(mataroaStatus(created, title, body, account));
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.crossPostError.set(
          error instanceof Error ? error.message : "Mataroa couldn't publish this post.",
        );
      },
    });
  }

  /**
   * Publish `parts` (link/mention facets attached) to Bluesky — the first as a
   * top-level post, each subsequent one as a reply to the one before it, which
   * is how Bluesky represents a thread. Completion is checkpointed here, but
   * the shared operation coordinator alone decides when the editor may reset.
   *
   * Threads used to be refused outright here, and refused *silently* — the
   * composer's submit button simply went dead the moment a second box had text
   * in it, with nothing on screen to say why. Bluesky has always supported
   * threads; only this client didn't.
   */
  private sendToBluesky(operation: PostingOperation): void {
    if (!operation.parts.length || operation.bsky.inFlight || operation.bsky.complete) return;
    operation.bsky.inFlight = true;
    // A resumed thread already has its first record and therefore its embed.
    if (operation.bsky.parts.length) {
      this.postBskyPart(operation);
      return;
    }
    // Images only, four at most — the protocol's cap. A "both" post can carry
    // more on the Fedi leg, so this trims rather than refusing; the composer
    // already said so when the target changed (`noteBlueskyMediaLimits`).
    const images = this.media()
      .filter((m) => m.file && isBlueskyAttachable(m.file))
      .slice(0, BSKY_MAX_IMAGES);
    if (!images.length) {
      this.postBskyPart(operation);
      return;
    }
    // Blobs must exist in the repo before the record that references them, so
    // the uploads finish first and the post carries the finished embed.
    void this.uploadBskyImages(images).then((embed) => {
      if (embed === null) {
        operation.bsky.inFlight = false;
        operation.bsky.failedAt = 0;
        this.showPostingFailure(operation, true);
        this.settlePosting(operation);
        return;
      }
      operation.bsky.embed = embed;
      this.postBskyPart(operation);
    });
  }

  /**
   * Downscale and upload each image, then assemble the record's embed.
   *
   * Returns null when any image fails, because a post that silently drops one
   * of four photos is worse than one that did not go out: the reader would have
   * to notice the omission themselves, after publishing.
   *
   * Alt text rides along from the composer's own editor — the same field the
   * Mastodon leg uses — because Bluesky's lexicon requires the key and an image
   * with no description is a real accessibility loss, not a formality.
   */
  private async uploadBskyImages(items: PendingMedia[]): Promise<BskyImagesEmbed | null> {
    const images: BskyImagesEmbed['images'] = [];
    for (const item of items) {
      const prepared = await prepareImageForBluesky(item.file!);
      if (!prepared) {
        return null;
      }
      try {
        const uploaded = await firstValueFrom(
          this.bskyApi.uploadBlob(prepared.blob, prepared.mimeType),
        );
        images.push({
          image: uploaded.blob,
          alt: item.description.trim(),
          aspectRatio: { width: prepared.width, height: prepared.height },
        });
      } catch {
        return null;
      }
    }
    return { $type: 'app.bsky.embed.images', images };
  }

  /**
   * One post of a Bluesky thread, then the next.
   *
   * Sequential rather than parallel because each reply needs the *previous*
   * post's uri/cid, which only exists once that post is created. `root` is
   * threaded through unchanged: Bluesky wants every reply to name the thread
   * root as well as its immediate parent.
   */
  private postBskyPart(operation: PostingOperation): void {
    const index = operation.bsky.parts.length;
    const text = operation.parts[index];
    const root = operation.bsky.parts[0]?.ref ?? null;
    const parent = operation.bsky.parts[index - 1]?.ref ?? null;
    let sentFacets: BskyFacet[] = [];
    const prepared = operation.bsky.preparedFacets[index];
    (prepared ? of(prepared) : detectFacets(text, (handle) => this.bskyApi.resolveHandle(handle)))
      .pipe(
        switchMap((facets) => {
          sentFacets = facets;
          operation.bsky.preparedFacets[index] = facets;
          const createdAt =
            operation.bsky.createdAt[index] ??
            (operation.bsky.createdAt[index] = new Date().toISOString());
          return this.bskyApi.post(
            {
              text,
              facets: facets.length ? facets : undefined,
              reply: root && parent ? { root, parent } : undefined,
              // First post only. Uploaded blob refs are retained on the
              // operation so an ambiguous record retry is byte-equivalent.
              embed: index === 0 ? operation.bsky.embed : undefined,
            },
            { rkey: tidFromSeed(`${operation.id}-${index}`), createdAt },
          );
        }),
      )
      .subscribe({
        next: (created) => {
          const ref = { uri: created.uri, cid: created.cid };
          operation.bsky.parts.push({ ref, facets: sentFacets });
          operation.bsky.failedAt = null;
          const last = index === operation.parts.length - 1;
          if (!last) {
            this.postBskyPart(operation);
            return;
          }
          operation.bsky.inFlight = false;
          operation.bsky.complete = true;
          this.showPostingFailure(operation);
          this.settlePosting(operation);
        },
        error: () => {
          operation.bsky.inFlight = false;
          operation.bsky.failedAt = index;
          this.showPostingFailure(operation);
          this.settlePosting(operation);
        },
      });
  }

  private showPostingFailure(operation: PostingOperation, imageUpload = false): void {
    if (operation.fedi.failure) {
      const completed = operation.fedi.statuses.length;
      const suffix = [
        completed
          ? ` The first ${completed === 1 ? 'post' : `${completed} posts`} of the Fedi thread were already published; retry will skip them.`
          : '',
        operation.bsky.complete
          ? ' The Bluesky copy was already published; retry will only continue Fedi.'
          : '',
      ].join('');
      this.postError.set({
        ...operation.fedi.failure,
        message: `${operation.fedi.failure.message}${suffix}`,
      });
    }
    if (operation.bsky.failedAt !== null) {
      const completed = operation.bsky.parts.length;
      const partial = completed
        ? ` The first ${completed === 1 ? 'post' : `${completed} posts`} of the Bluesky thread were already published; retry will skip them.`
        : '';
      const reason = imageUpload
        ? "Couldn't upload the image to Bluesky; nothing was posted there."
        : "Couldn't post to Bluesky.";
      this.crossPostError.set(
        operation.fedi.complete
          ? `Posted to Fedi, but the Bluesky copy is incomplete. ${reason}${partial} Retry will only continue Bluesky.`
          : `${reason}${partial} Retry will continue only the unfinished work.`,
      );
    }
  }

  /** The only place a timeline operation may clear the editor or emit its result. */
  private settlePosting(operation: PostingOperation): void {
    const fediDone = operation.target === 'bsky' || operation.fedi.complete;
    const bskyDone = operation.target === 'fedi' || operation.bsky.complete;
    const stillRunning = operation.fedi.inFlight || operation.bsky.inFlight;
    if (!fediDone || !bskyDone) {
      this.submitting.set(stillRunning);
      return;
    }
    if (
      this.postingOperation !== operation ||
      this.postingFingerprint(operation.target) !== operation.fingerprint
    ) {
      this.submitting.set(false);
      return;
    }

    let result: Status | null = null;
    if (operation.target === 'bsky') {
      const root = operation.bsky.parts[0];
      result = buildLocalBskyStatus(
        this.bskySession.session()!,
        root.ref.uri,
        root.ref.cid,
        operation.parts[0],
        root.facets,
      );
    } else if (operation.scheduledFor) {
      if ('params' in operation.fedi.statuses[0]) {
        this.flashScheduled(
          `Scheduled for ${operation.scheduledFor.toLocaleString()} — see it under Drafts.`,
        );
      } else {
        this.flashScheduled('That was under ~5 minutes away, so it was posted right away.');
        result = operation.fedi.statuses[0];
        this.offerSelfCleanup();
      }
    } else {
      result = operation.fedi.statuses[0];
      this.offerSelfCleanup();
    }
    this.reset();
    if (result) this.posted.emit(result);
  }

  private reset(): void {
    this.postingOperation = null;
    this.text.set('');
    this.thread.set([]);
    this.submitting.set(false);
    this.postError.set(null);
    this.cwOpen.set(false);
    this.spoilerText.set('');
    this.sensitive.set(false);
    // Free the object URLs before dropping the list, or the files stay pinned
    // in memory for the life of the tab.
    for (const item of this.media()) {
      releaseLocalMedia(item.media);
    }
    this.media.set([]);
    this.mediaNotice.set('');
    this.pollOpen.set(false);
    this.pollOptions.set(['', '']);
    this.pollMultiple.set(false);
    this.scheduleOpen.set(false);
    this.scheduleAt.set('');
    this.emojiOpen.set(false);
    // Draft-vs-publish is a per-post decision, not a standing preference: the
    // next post silently going to drafts would be a nasty surprise.
    this.blogDraft.set(false);
    this.langMismatch.set(null);
    this.lastFocusedBox = null;
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.drafts.clearAutosave(this.contextKey());
  }
}
