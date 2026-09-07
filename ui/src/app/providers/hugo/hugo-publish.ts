import { inject, Injectable } from '@angular/core';
import { Account, Status } from '../../models';
import { HugoApiError, HugoContents, HugoPutResult } from './hugo-contents';
import { HugoEdit } from './hugo-edit-session';
import { FrontMatterFormat, serializeFrontMatter, tagsFromBody } from './hugo-front-matter';
import { bumpSlug, hugoStatus, postPath, postSlug, predictedPermalink } from './hugo-post';
import { HugoSettings } from './hugo-settings';

/**
 * How many times a colliding slug is retried with a `-2`, `-3` suffix.
 *
 * Three in a row means something other than "I wrote about this twice" is going
 * on — a misconfigured content path pointing at a directory of unrelated files,
 * say — and looping harder would just make the eventual error later and
 * stranger.
 */
const MAX_SLUG_ATTEMPTS = 3;

export interface PublishRequest {
  title: string;
  body: string;
  isDraft: boolean;
  account: Account;
}

export interface PublishResult {
  status: Status;
  /** The slug actually used, which may not be the one the title implied. */
  slug: string;
  /** True when a collision pushed the post onto a numbered slug. */
  renamed: boolean;
  /** The commit, so the caller can watch its build without unpacking `status`. */
  commit: HugoPutResult;
}

export interface UpdateRequest {
  title: string;
  body: string;
  isDraft: boolean;
  /** The file being rewritten, as parked by {@link HugoEditSession}. */
  edit: HugoEdit;
}

export interface UpdateResult {
  commit: HugoPutResult;
  /** Unchanged by an edit — the post keeps its address. */
  slug: string;
}

/** Turns a composer submission into a commit, and the commit into a `Status`. */
@Injectable({ providedIn: 'root' })
export class HugoPublish {
  private readonly contents = inject(HugoContents);
  private readonly settings = inject(HugoSettings);

  /**
   * Publish a new post.
   *
   * Always a *create* — no `sha` is sent — so GitHub is the thing that decides
   * whether the slug is free. That is deliberate: a read-then-write existence
   * check races with anything else committing to the repo, whereas the 422 is
   * authoritative. Editing an existing post goes through {@link update}, which
   * is the only path that sends a sha.
   */
  async publish(request: PublishRequest): Promise<PublishResult> {
    const repo = this.settings.repo();
    if (!repo) {
      throw new Error('Connect your Hugo repository in Settings first.');
    }
    const title = request.title.trim();
    const body = request.body.trim();
    if (!title) {
      throw new Error('Give the post a title.');
    }
    if (!body) {
      throw new Error('Write something to publish.');
    }

    const baseSlug = postSlug(title);
    const file = serializeFrontMatter(
      {
        title,
        date: new Date().toISOString(),
        draft: request.isDraft,
        tags: tagsFromBody(body),
      },
      body,
      'toml' satisfies FrontMatterFormat,
    );

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = bumpSlug(baseSlug, attempt);
      try {
        const commit = await this.contents.putFile({
          path: postPath(repo.contentPath, slug),
          text: file,
          message: `${request.isDraft ? 'Draft' : 'Publish'}: ${title}`,
        });
        return {
          status: hugoStatus(commit, title, body, request.account, {
            slug,
            permalink: predictedPermalink(repo.siteUrl, repo.contentPath, slug),
            isDraft: request.isDraft,
          }),
          slug,
          renamed: attempt > 1,
          commit,
        };
      } catch (error: unknown) {
        // 422 here means "that path already exists" — the one error worth
        // retrying, because the fix is mechanical. Anything else is the user's
        // to see.
        if (!(error instanceof HugoApiError && error.status === 422)) {
          throw error;
        }
        if (attempt === MAX_SLUG_ATTEMPTS) {
          throw new HugoApiError(
            422,
            `There are already posts named "${baseSlug}" in ${repo.contentPath}. Try a different title.`,
          );
        }
      }
    }
    // Unreachable: the loop either returns or throws.
    throw new Error('Could not publish this post.');
  }

  /**
   * Rewrite an existing post in place.
   *
   * Three things this deliberately does *not* do, each of which would look like
   * a feature and behave like data loss:
   *
   * - **It does not move the file.** Editing the title leaves the slug, and so
   *   the post's public URL, exactly where it was. A live post that changes
   *   address breaks every link to it.
   * - **It does not restamp the date.** `edit.date` is carried through verbatim,
   *   so fixing a typo does not reorder the blog.
   * - **It does not drop unknown front matter.** `edit.extraLines` holds every
   *   key we do not model, and they go back in untouched.
   *
   * The `sha` is the concurrency check: GitHub 409s if the file changed since it
   * was read, which the caller surfaces rather than retrying.
   */
  async update(request: UpdateRequest): Promise<UpdateResult> {
    const title = request.title.trim();
    const body = request.body.trim();
    if (!title) {
      throw new Error('Give the post a title.');
    }
    if (!body) {
      throw new Error('Write something to publish.');
    }

    const file = serializeFrontMatter(
      {
        title,
        // Its own publish date, not now. See the note above.
        date: request.edit.date ?? new Date().toISOString(),
        draft: request.isDraft,
        tags: tagsFromBody(body),
      },
      body,
      request.edit.format,
      request.edit.extraLines,
    );

    const commit = await this.contents.putFile({
      path: request.edit.path,
      text: file,
      message: `Update: ${title}`,
      sha: request.edit.sha,
    });
    return { commit, slug: slugOf(request.edit.path) };
  }
}

/** `content/posts/hello-world.md` → `hello-world`. */
function slugOf(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.(md|markdown)$/i, '');
}
