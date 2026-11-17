import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../platform/session/auth';
import { MataroaApi } from '../connections/mataroa/mataroa-api';
import { HugoPublish } from '../connections/hugo/hugo-publish';
import { HugoDeployWatch } from '../connections/hugo/hugo-deploy-watch';
import { BlueskyPublication } from '../publishing/write/bluesky-publication';
import { DraftMedia } from '../publishing/drafts';
import { bodyTitle } from './blog-write';

/**
 * Cross-posting a blog post at publish time — the second-class half of Blog
 * mode (spec/blog-mode.md). Mastodon is always published first and is the
 * source of truth; these copies are **fire and forget**: each is tried once,
 * reported once, never retried, and never updated when the storm is edited.
 */

export type CrossTarget = 'mataroa' | 'hugo' | 'bsky';

/** In menu order. Blogger is deliberately absent (Google's app approval). */
export const CROSS_TARGETS: readonly CrossTarget[] = ['mataroa', 'hugo', 'bsky'];

/** The subset of Write's target availability that cross-posting reads. */
export interface CrossAvailability {
  mastodonToken: boolean;
  bskyLinked: boolean;
  mataroaConnected: boolean;
  hugoConnected: boolean;
  mataroaEnabled: boolean;
  hugoEnabled: boolean;
}

/** Targets that are connected and switched on. A copy needs a Mastodon original. */
export function availableCrossTargets(av: CrossAvailability): CrossTarget[] {
  if (!av.mastodonToken) {
    return [];
  }
  return CROSS_TARGETS.filter((target) =>
    target === 'mataroa'
      ? av.mataroaEnabled && av.mataroaConnected
      : target === 'hugo'
        ? av.hugoEnabled && av.hugoConnected
        : av.bskyLinked,
  );
}

/**
 * A blog engine's copy: the title from the first line, then the storm as
 * paragraphs, then where the original lives.
 */
export function crossPostText(parts: string[], link: string): { title: string; body: string } {
  const clean = parts.map((part) => part.trim()).filter(Boolean);
  const first = clean[0] ?? '';
  const newline = first.indexOf('\n');
  const rest = [newline < 0 ? '' : first.slice(newline + 1).trim(), ...clean.slice(1)].filter(
    Boolean,
  );
  return {
    title: bodyTitle(first),
    body: [...rest, `Originally posted on Mastodon: ${link}`].join('\n\n'),
  };
}

export interface CrossResult {
  target: CrossTarget;
  ok: boolean;
  error?: string;
}

/** Provided by Write, beside the Bluesky publisher it shares. */
@Injectable()
export class BlogCrossPost {
  private readonly auth = inject(Auth);
  private readonly mataroa = inject(MataroaApi);
  private readonly hugo = inject(HugoPublish);
  private readonly deployWatch = inject(HugoDeployWatch);
  private readonly bluesky = inject(BlueskyPublication);

  /** The latest run's outcome, one line per target, for Write to show. */
  readonly results = signal<CrossResult[]>([]);
  readonly running = signal(false);

  /** Try each target once, independently. Never throws. */
  async run(
    targets: readonly CrossTarget[],
    parts: string[],
    link: string,
    media: DraftMedia[] = [],
  ): Promise<CrossResult[]> {
    this.results.set([]);
    if (!targets.length) {
      return [];
    }
    this.running.set(true);
    const { title, body } = crossPostText(parts, link);
    const results = await Promise.all(
      targets.map(async (target): Promise<CrossResult> => {
        try {
          await this.send(target, title, body, parts, media);
          return { target, ok: true };
        } catch (error) {
          return {
            target,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    this.results.set(results);
    this.running.set(false);
    return results;
  }

  private async send(
    target: CrossTarget,
    title: string,
    body: string,
    parts: string[],
    media: DraftMedia[],
  ): Promise<void> {
    if (target === 'mataroa') {
      await firstValueFrom(this.mataroa.createPost(title, body));
      return;
    }
    if (target === 'hugo') {
      const account = this.auth.account();
      if (!account) {
        throw new Error('Sign in before publishing.');
      }
      const result = await this.hugo.publish({ title, body, account, isDraft: false });
      this.deployWatch.watch(result.commit.commitSha);
      return;
    }
    // Bluesky gets the storm as its own thread, images as Write would send them.
    await this.bluesky.publish(
      parts,
      media.filter((item) => item.file?.type.startsWith('image/')).slice(0, 4),
    );
  }
}
