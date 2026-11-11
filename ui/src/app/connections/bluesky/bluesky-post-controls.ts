import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BlueskyApi } from './bluesky-api';

const THREADGATE = 'app.bsky.feed.threadgate';
const POSTGATE = 'app.bsky.feed.postgate';

/** Who may reply: everyone, nobody, or anyone matching at least one rule. */
export type BskyReplyRule = 'mention' | 'follower' | 'following';
export type BskyReplySetting = 'everyone' | 'nobody' | BskyReplyRule[];

/** The author's controls over one of their posts, as the dialog edits them. */
export interface BskyPostControlsValue {
  replies: BskyReplySetting;
  quotes: boolean;
  /** List rules set elsewhere (bsky.app). Kept unless replies become everyone or nobody. */
  lists?: number;
}

interface ThreadgateRecord {
  $type: typeof THREADGATE;
  post: string;
  createdAt: string;
  allow?: { $type: string; list?: string }[];
  hiddenReplies?: string[];
}

interface PostgateRecord {
  $type: typeof POSTGATE;
  post: string;
  createdAt: string;
  embeddingRules?: { $type: string }[];
  detachedEmbeddingUris?: string[];
}

const RULE_TYPES: Record<BskyReplyRule, string> = {
  mention: `${THREADGATE}#mentionRule`,
  follower: `${THREADGATE}#followerRule`,
  following: `${THREADGATE}#followingRule`,
};

function rkeyOf(postUri: string): { repo: string; rkey: string } {
  const [repo, , rkey] = postUri.replace('at://', '').split('/');
  return { repo, rkey };
}

/**
 * Reply and quote controls on the signed-in account's own Bluesky posts.
 *
 * Bluesky keeps these beside the post, not in it: a threadgate record decides
 * who may reply and which replies are hidden, a postgate record whether the
 * post may be quoted and which quotes it is detached from. Both share the
 * post's record key. Every write reads the current record first and keeps
 * what it is not editing (list rules, hidden replies, detached quotes), so a
 * change made on bsky.app is never undone from here.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyPostControls {
  private api = inject(BlueskyApi);

  async read(postUri: string): Promise<BskyPostControlsValue> {
    const [gate, postgate] = await Promise.all([
      this.get<ThreadgateRecord>(THREADGATE, postUri),
      this.get<PostgateRecord>(POSTGATE, postUri),
    ]);
    const lists = (gate?.allow ?? []).filter((rule) => rule.$type.endsWith('#listRule')).length;
    return { replies: replySetting(gate), quotes: !quotesDisabled(postgate), lists };
  }

  async write(postUri: string, value: BskyPostControlsValue): Promise<void> {
    const [gate, postgate] = await Promise.all([
      this.get<ThreadgateRecord>(THREADGATE, postUri),
      this.get<PostgateRecord>(POSTGATE, postUri),
    ]);
    const lists = (gate?.allow ?? []).filter((rule) => rule.$type.endsWith('#listRule'));
    const allow =
      value.replies === 'everyone'
        ? undefined
        : value.replies === 'nobody'
          ? []
          : [...value.replies.map((rule) => ({ $type: RULE_TYPES[rule] })), ...lists];
    await this.save(THREADGATE, postUri, {
      $type: THREADGATE,
      post: postUri,
      createdAt: gate?.createdAt ?? new Date().toISOString(),
      ...(allow ? { allow } : {}),
      ...(gate?.hiddenReplies?.length ? { hiddenReplies: gate.hiddenReplies } : {}),
    });
    await this.save(POSTGATE, postUri, {
      $type: POSTGATE,
      post: postUri,
      createdAt: postgate?.createdAt ?? new Date().toISOString(),
      ...(value.quotes ? {} : { embeddingRules: [{ $type: `${POSTGATE}#disableRule` }] }),
      ...(postgate?.detachedEmbeddingUris?.length
        ? { detachedEmbeddingUris: postgate.detachedEmbeddingUris }
        : {}),
    });
  }

  /** Hide or show a reply in a thread the signed-in account started. */
  async setReplyHidden(rootUri: string, replyUri: string, hidden: boolean): Promise<void> {
    const gate = await this.get<ThreadgateRecord>(THREADGATE, rootUri);
    const others = (gate?.hiddenReplies ?? []).filter((uri) => uri !== replyUri);
    const hiddenReplies = hidden ? [...others, replyUri] : others;
    await this.save(THREADGATE, rootUri, {
      ...(gate ?? { $type: THREADGATE, post: rootUri, createdAt: new Date().toISOString() }),
      hiddenReplies,
    });
  }

  /** Detach the signed-in account's post from a quote of it, or reattach it. */
  async setQuoteDetached(postUri: string, quoteUri: string, detached: boolean): Promise<void> {
    const postgate = await this.get<PostgateRecord>(POSTGATE, postUri);
    const others = (postgate?.detachedEmbeddingUris ?? []).filter((uri) => uri !== quoteUri);
    await this.save(POSTGATE, postUri, {
      ...(postgate ?? { $type: POSTGATE, post: postUri, createdAt: new Date().toISOString() }),
      detachedEmbeddingUris: detached ? [...others, quoteUri] : others,
    });
  }

  private async get<T>(collection: string, postUri: string): Promise<T | undefined> {
    const { repo, rkey } = rkeyOf(postUri);
    const params = new HttpParams()
      .set('repo', repo)
      .set('collection', collection)
      .set('rkey', rkey);
    try {
      const record = await firstValueFrom(
        this.api.get<{ value: T }>('com.atproto.repo.getRecord', params),
      );
      return record.value;
    } catch (error: unknown) {
      const code =
        error instanceof HttpErrorResponse
          ? (error.error as { error?: string } | null)?.error
          : undefined;
      if (code === 'RecordNotFound' || (error instanceof HttpErrorResponse && error.status === 404))
        return undefined;
      throw error;
    }
  }

  /**
   * Put the record, or delete it when it says nothing beyond the defaults.
   * An empty gate is the same as no gate, and leaving none keeps the repo tidy.
   */
  private async save(
    collection: string,
    postUri: string,
    record: ThreadgateRecord | PostgateRecord,
  ): Promise<void> {
    const { repo, rkey } = rkeyOf(postUri);
    const empty =
      record.$type === THREADGATE
        ? record.allow === undefined && !record.hiddenReplies?.length
        : !record.embeddingRules?.length && !record.detachedEmbeddingUris?.length;
    if (empty) {
      const existing = await this.get(collection, postUri);
      if (existing) {
        await firstValueFrom(this.api.deleteRecord(`at://${repo}/${collection}/${rkey}`));
      }
      return;
    }
    await firstValueFrom(
      this.api.request('com.atproto.repo.putRecord', { repo, collection, rkey, record }),
    );
  }
}

function replySetting(gate: ThreadgateRecord | undefined): BskyReplySetting {
  if (!gate?.allow) return 'everyone';
  const rules = (Object.keys(RULE_TYPES) as BskyReplyRule[]).filter((rule) =>
    gate.allow!.some((allowed) => allowed.$type === RULE_TYPES[rule]),
  );
  // Only list rules (kept, not edited here) is still a limit: an empty rule set.
  return rules.length || gate.allow.length ? rules : 'nobody';
}

function quotesDisabled(postgate: PostgateRecord | undefined): boolean {
  return !!postgate?.embeddingRules?.some((rule) => rule.$type === `${POSTGATE}#disableRule`);
}
