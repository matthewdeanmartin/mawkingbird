import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AccountDrafts, Draft, DraftMirror } from '../../publishing/drafts';
import { BlueskyApi } from './bluesky-api';

/** `app.bsky.draft.defs#draftView`, the parts read here. */
interface BskyDraftView {
  id: string;
  draft: { posts: { text: string }[]; langs?: string[] };
  updatedAt: string;
}

/** Bluesky's draft limits: 100 posts of 10,000 characters. */
const MAX_POSTS = 100;
const MAX_TEXT = 10_000;

/** The targets whose drafts belong in the Bluesky account. */
function isBlueskyDraft(draft: Pick<Draft, 'target'>): boolean {
  return draft.target === undefined || draft.target === 'bsky' || draft.target === 'both';
}

/**
 * Bluesky's own drafts (`app.bsky.draft.*`) for a Bluesky-first account, so a
 * draft saved here shows in bsky.app and the other way round (owner decision,
 * spec/bsky_parity.md sprint 6). Local drafts stay the working copy; this
 * mirrors each save, update and delete, and pulls in drafts made elsewhere.
 *
 * Text and thread only: Bluesky keeps a draft's media as paths on the device
 * that made it, so attachments do not travel, as in bsky.app.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyDraftSync {
  private api = inject(BlueskyApi);

  /** The hook a store calls after each durable change. */
  mirrorFor(store: AccountDrafts): DraftMirror {
    return {
      saved: (draft) => void this.saved(store, draft).catch(() => undefined),
      removed: (draft) => void this.removed(draft).catch(() => undefined),
    };
  }

  /** Bring in drafts saved in bsky.app (or another device) that this browser lacks. */
  async pull(store: AccountDrafts): Promise<number> {
    const { drafts } = await firstValueFrom(
      this.api.get<{ drafts: BskyDraftView[] }>(
        'app.bsky.draft.getDrafts',
        new HttpParams().set('limit', '100'),
      ),
    );
    const known = new Set(
      store
        .drafts()
        .map((d) => d.blueskyDraftId)
        .filter(Boolean),
    );
    const fresh = drafts.filter((view) => !known.has(view.id));
    for (const view of fresh) {
      store.importRemote({
        segments: view.draft.posts.map((post) => post.text),
        spoilerText: '',
        sensitive: false,
        visibility: 'public',
        poll: null,
        target: 'bsky',
        ...(view.draft.langs?.[0] ? { postLanguage: view.draft.langs[0] } : {}),
        blueskyDraftId: view.id,
        updatedAt: view.updatedAt,
      });
    }
    return fresh.length;
  }

  private async saved(store: AccountDrafts, draft: Draft): Promise<void> {
    if (!isBlueskyDraft(draft)) return;
    const body = toRemote(draft);
    if (!body.posts.length) return;
    if (draft.blueskyDraftId) {
      await firstValueFrom(
        this.api.request('app.bsky.draft.updateDraft', {
          draft: { id: draft.blueskyDraftId, draft: body },
        }),
      );
      return;
    }
    const { id } = await firstValueFrom(
      this.api.request<{ id: string }>('app.bsky.draft.createDraft', { draft: body }),
    );
    store.setRemoteId(draft.id, id);
  }

  private async removed(draft: Draft): Promise<void> {
    if (!draft.blueskyDraftId) return;
    await firstValueFrom(
      this.api.request('app.bsky.draft.deleteDraft', { id: draft.blueskyDraftId }),
    );
  }
}

/** A local draft as `app.bsky.draft.defs#draft`. */
export function toRemote(draft: Pick<Draft, 'segments' | 'postLanguage'>): {
  posts: { text: string }[];
  langs?: string[];
} {
  const posts = draft.segments
    .filter((text) => text.trim())
    .slice(0, MAX_POSTS)
    .map((text) => ({ text: text.slice(0, MAX_TEXT) }));
  return { posts, ...(draft.postLanguage ? { langs: [draft.postLanguage] } : {}) };
}
