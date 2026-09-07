import { Draft, DraftSnapshot } from '../../drafts';
import { ScheduledStatus, Status } from '../../models';
import { PasteRecord } from '../../providers/paste/paste-history';
import { stripHtml } from '../../sentiment';

/**
 * The four mechanisms that can hold an unpublished post.
 *
 * Mastodon has no drafts API, so a "draft" is a concept rather than a storage
 * location. Each of these is a different real place a post-in-waiting can live,
 * with genuinely different durability and privacy — and the user should see all
 * four in one list instead of learning four different hiding places.
 *
 * - `local`     — this browser's localStorage. Private, instant, doesn't travel.
 * - `scheduled` — a server-side scheduled post parked far enough out that it
 *                 will never realistically fire. Travels; the server holds it.
 * - `self`      — a `direct` post mentioning nobody. The mastodon.social folk
 *                 recipe: it travels, but an instance admin can read it.
 * - `paste`     — text parked at an external paste service. Travels via its
 *                 link, and is *not* private.
 */
export type DraftKind = 'local' | 'scheduled' | 'self' | 'paste';

/** Sources are loaded independently so one failure can't hide the other three. */
export interface DraftSourceError {
  kind: DraftKind;
  message: string;
}

/** One row in the merged drafts list, whatever mechanism it came from. */
export interface DraftItem {
  /** Unique across kinds — ids are only unique *within* a source. */
  key: string;
  kind: DraftKind;
  id: string;
  /** ISO timestamp the list sorts on (newest first). */
  at: string;
  /** Plain-text preview, already truncated. */
  preview: string;
  /** Visibility to display, or null where the kind has no meaningful one. */
  visibility: string | null;
  /** Translation keys; dynamic provider metadata remains display text. */
  badges: string[];
  /** The underlying record, for the actions that need it. */
  source: DraftSource;
}

export type DraftSource =
  | { kind: 'local'; draft: Draft }
  | { kind: 'scheduled'; scheduled: ScheduledStatus }
  | { kind: 'self'; status: Status }
  | { kind: 'paste'; record: PasteRecord };

/**
 * How far out a scheduled post has to be before it reads as a draft rather than
 * a pending post. Mastodon has no "hold indefinitely", so parking a post at the
 * end of time is the closest thing to a server-side draft — and ten years is
 * comfortably past any real "publish this later" intent.
 */
export const PARKED_SCHEDULE_YEARS = 10;

/**
 * How far back to look for posts-to-self. Without a bound, /drafts fills up with
 * years of old self-notes that the user long ago stopped thinking of as drafts.
 * Older ones remain exactly where they were, in Conversations.
 */
export const SELF_DRAFT_MAX_AGE_DAYS = 30;

// i18n pages.drafts.badges.thread: 🧵 thread of {{count}}
// i18n pages.drafts.badges.title: Title
// i18n pages.drafts.badges.cw: CW
// i18n pages.drafts.badges.bsky: 🦋 bsky
// i18n pages.drafts.badges.poll: 📊 poll
// i18n pages.drafts.badges.reply: ↩ reply
// i18n pages.drafts.badges.quote: ❝ quote
// i18n pages.drafts.badges.attachments: 📎 {{count}}
// i18n pages.drafts.badges.burn: 🔥 burn
// i18n pages.drafts.preview.pollDraft: (poll draft)
// i18n pages.drafts.preview.emptyDraft: (empty draft)
// i18n pages.drafts.preview.emptyPaste: (empty paste)

const PREVIEW_CHARS = 140;

/** A scheduled post parked so far out that it is really a draft. */
export function isParkedSchedule(scheduled: ScheduledStatus, now: number = Date.now()): boolean {
  const at = Date.parse(scheduled.scheduled_at);
  if (Number.isNaN(at)) {
    return false;
  }
  const threshold = new Date(now);
  threshold.setFullYear(threshold.getFullYear() + PARKED_SCHEDULE_YEARS);
  return at > threshold.getTime();
}

/**
 * A post the user made to nobody but themselves, recently enough to still count
 * as work in progress.
 *
 * `direct` + zero mentions is the whole signal, and it is a sound one: a real DM
 * always mentions the person it is addressed to, so there is no class of genuine
 * message this can misread. Missing `mentions` is treated as "not a draft"
 * rather than "no mentions" — showing someone's actual private message in a
 * drafts list is a much worse failure than omitting a note-to-self.
 */
export function isSelfDraft(status: Status, accountId: string, now: number = Date.now()): boolean {
  if (status.account?.id !== accountId || status.visibility !== 'direct' || status.reblog) {
    return false;
  }
  if (!Array.isArray(status.mentions) || status.mentions.length > 0) {
    return false;
  }
  const created = Date.parse(status.created_at);
  if (Number.isNaN(created)) {
    return false;
  }
  return now - created <= SELF_DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function truncate(text: string, empty: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return empty;
  }
  return trimmed.length > PREVIEW_CHARS ? `${trimmed.slice(0, PREVIEW_CHARS)}…` : trimmed;
}

export function localDraftItem(draft: Draft): DraftItem {
  const filled = draft.segments.filter((s) => s.trim());
  const badges: string[] = [];
  if (filled.length > 1) {
    badges.push(`pages.drafts.badges.thread|${filled.length}`);
  }
  if (draft.spoilerText) {
    badges.push(draft.target === 'paste' ? 'pages.drafts.badges.title' : 'pages.drafts.badges.cw');
  }
  // A local draft *aimed* at a paste service hasn't been pasted yet — it is
  // still local. The badge says where it's headed.
  if (draft.target === 'paste') {
    badges.push(`📋 ${draft.pasteProviderId ?? 'paste'}`);
  }
  if (draft.target === 'bsky' || draft.target === 'both') {
    badges.push('pages.drafts.badges.bsky');
  }
  if (draft.poll) {
    badges.push('pages.drafts.badges.poll');
  }
  if (draft.inReplyToId) {
    badges.push('pages.drafts.badges.reply');
  }
  if (draft.quotedStatusId) {
    badges.push('pages.drafts.badges.quote');
  }
  return {
    key: `local:${draft.id}`,
    kind: 'local',
    id: draft.id,
    at: draft.updatedAt,
    preview: truncate(
      filled[0] ?? '',
      draft.poll ? 'pages.drafts.preview.pollDraft' : 'pages.drafts.preview.emptyDraft',
    ),
    visibility: draft.visibility,
    badges,
    source: { kind: 'local', draft },
  };
}

export function scheduledDraftItem(scheduled: ScheduledStatus): DraftItem {
  const badges: string[] = [];
  if (scheduled.params.spoiler_text) {
    badges.push('pages.drafts.badges.cw');
  }
  if (scheduled.params.poll) {
    badges.push('pages.drafts.badges.poll');
  }
  if (scheduled.media_attachments.length) {
    badges.push(`pages.drafts.badges.attachments|${scheduled.media_attachments.length}`);
  }
  return {
    key: `scheduled:${scheduled.id}`,
    kind: 'scheduled',
    // Parked schedules sort by their publish date like everything else; they all
    // cluster at the far end of time, which is exactly where they belong.
    id: scheduled.id,
    at: scheduled.scheduled_at,
    preview: truncate(
      scheduled.params.text ?? '',
      scheduled.media_attachments.length
        ? 'pages.drafts.preview.mediaPost'
        : 'pages.drafts.preview.emptyPost',
    ),
    visibility: scheduled.params.visibility ?? null,
    badges,
    source: { kind: 'scheduled', scheduled },
  };
}

export function selfDraftItem(status: Status): DraftItem {
  const badges: string[] = [];
  if (status.spoiler_text) {
    badges.push('pages.drafts.badges.cw');
  }
  if (status.poll) {
    badges.push('pages.drafts.badges.poll');
  }
  if (status.media_attachments.length) {
    badges.push(`pages.drafts.badges.attachments|${status.media_attachments.length}`);
  }
  return {
    key: `self:${status.id}`,
    kind: 'self',
    id: status.id,
    at: status.created_at,
    preview: truncate(stripHtml(status.content), 'pages.drafts.preview.emptyPost'),
    visibility: status.visibility,
    badges,
    source: { kind: 'self', status },
  };
}

export function pasteDraftItem(record: PasteRecord): DraftItem {
  const badges: string[] = [`📋 ${record.providerLabel}`];
  if (record.title?.trim()) {
    badges.push('pages.drafts.badges.title');
  }
  if (record.language && record.language !== 'plaintext') {
    badges.push(record.language);
  }
  if (record.expiry && record.expiry !== 'never') {
    badges.push(record.expiry === 'burn' ? 'pages.drafts.badges.burn' : `⌛ ${record.expiry}`);
  }
  return {
    key: `paste:${record.slug}`,
    kind: 'paste',
    id: record.slug,
    at: record.createdAt,
    preview: truncate(record.title?.trim() || record.content, 'pages.drafts.preview.emptyPaste'),
    visibility: record.visibility ?? null,
    badges,
    source: { kind: 'paste', record },
  };
}

/**
 * Read any draft, of any kind, into the one neutral shape everything else
 * writes from.
 *
 * Converting between four kinds pairwise is twelve conversions; routing every
 * one through a single intermediate makes it four readers and three writers.
 * `DraftSnapshot` is already that intermediate — it is what the composer saves
 * and restores — so conversions reduce to "extract, then hand to a writer", and
 * the whole extraction matrix stays pure and testable without a component.
 *
 * `fallbackVisibility` is the account's posting default, and it matters most for
 * self drafts: see below.
 */
export function toSnapshot(source: DraftSource, fallbackVisibility: string): DraftSnapshot {
  switch (source.kind) {
    case 'local': {
      // Already a snapshot — drop only the identity fields.
      const { id: _id, updatedAt: _updatedAt, ...snapshot } = source.draft;
      return snapshot;
    }
    case 'scheduled': {
      const params = source.scheduled.params;
      return {
        segments: [params.text ?? ''],
        spoilerText: params.spoiler_text ?? '',
        sensitive: params.sensitive ?? false,
        visibility: params.visibility ?? fallbackVisibility,
        // `ScheduledStatus['params']` carries only the poll's options — its
        // duration and multiple-choice flag aren't returned — so those fall back
        // to the composer's own defaults rather than being invented here.
        poll: params.poll
          ? { options: params.poll.options, multiple: false, expiresIn: 86400 }
          : null,
        inReplyToId: params.in_reply_to_id ?? undefined,
        target: 'fedi',
      };
    }
    case 'self':
      return {
        segments: [stripHtml(source.status.content)],
        spoilerText: source.status.spoiler_text,
        sensitive: source.status.sensitive,
        // Deliberately NOT the source's `direct`. A self draft is direct only as
        // a storage trick — carrying that forward would publish the "real" post
        // to an audience of nobody, which is exactly the failure this whole
        // feature exists to stop people hitting by hand.
        visibility: fallbackVisibility,
        poll: source.status.poll
          ? {
              options: source.status.poll.options.map((o) => o.title),
              multiple: source.status.poll.multiple,
              expiresIn: 86400,
            }
          : null,
        target: 'fedi',
      };
    case 'paste':
      return {
        segments: [source.record.content],
        // The paste's title is a title, not a content warning — which is why the
        // badge for a paste-target draft already reads "Title".
        spoilerText: source.record.title ?? '',
        sensitive: false,
        visibility: fallbackVisibility,
        poll: null,
        target: 'paste',
        pasteProviderId: source.record.providerId,
        pasteLanguage: source.record.language,
        pasteExpiry: source.record.expiry,
      };
  }
}

/**
 * Merge every source into one newest-first list.
 *
 * Deliberately does not deduplicate across kinds. A converted draft is an
 * independent copy — there is no cross-kind identity to match on, and inventing
 * one would mean guessing that two similar texts are "the same" post.
 */
export function mergeDraftItems(groups: readonly DraftItem[][]): DraftItem[] {
  return groups.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
