import { inject, Injectable } from '@angular/core';
import { HugoApiError, HugoContents } from './hugo-contents';
import { HugoRepo, HugoSettings } from './hugo-settings';

/**
 * Check a repo before storing it, so the composer never offers a blog target
 * that can only fail.
 *
 * Four things can be wrong and each has a different fix, so each gets its own
 * message. "Setup failed" is how a connector becomes unsupportable: the user
 * cannot tell a bad token from a typo'd branch name, and neither can whoever
 * they ask for help.
 *
 * Validation is also the only place that verifies the *write* half of the
 * token, and it does so without writing anything: a token that can read a
 * private repo's contents may still lack `Contents: write`. We cannot prove
 * write access without committing, so we don't pretend to — we check what we
 * can, and let the first publish surface a 403 with a message that names the
 * missing permission.
 */
export interface HugoValidation {
  /** True when the repo is safe to store. */
  ok: boolean;
  /** What to tell the user, when it is not. */
  problem: string | null;
  /** Whether the repo looks like a Hugo site at all. Warning, not a blocker. */
  looksLikeHugo: boolean;
  /** How many Markdown posts the content folder already holds. */
  postCount: number;
}

/** Any of these at the repo root means somebody ran `hugo new site`. */
const HUGO_CONFIG_FILES = [
  'hugo.toml',
  'hugo.yaml',
  'hugo.yml',
  'hugo.json',
  'config.toml',
  'config.yaml',
  'config.yml',
  'config.json',
];

@Injectable({ providedIn: 'root' })
export class HugoValidate {
  private readonly contents = inject(HugoContents);
  private readonly settings = inject(HugoSettings);

  /**
   * Validate by temporarily storing the candidate connection.
   *
   * `HugoContents` reads its coordinates from `HugoSettings`, so the candidate
   * has to be live for the check to use it. On failure the previous connection
   * — or none — is put back, which is what makes a failed "Connect" a no-op
   * rather than a half-configured blog.
   */
  async check(token: string, candidate: HugoRepo): Promise<HugoValidation> {
    const previousRepo = this.settings.repo();
    const previousToken = this.settings.token();
    this.settings.connect(token, candidate);
    try {
      return await this.run(candidate);
    } finally {
      if (previousRepo && previousToken) {
        this.settings.connect(previousToken, previousRepo);
      } else {
        this.settings.disconnect();
      }
    }
  }

  private async run(candidate: HugoRepo): Promise<HugoValidation> {
    const fail = (problem: string): HugoValidation => ({
      ok: false,
      problem,
      looksLikeHugo: false,
      postCount: 0,
    });

    // 1. The branch. Checking this first turns the most common typo into a
    //    precise message instead of a confusing 404 on the content folder.
    try {
      const exists = await this.contents.branchExists(
        candidate.owner,
        candidate.repo,
        candidate.branch,
        this.settings.token() ?? '',
      );
      if (!exists) {
        return fail(
          `${candidate.owner}/${candidate.repo} has no branch called "${candidate.branch}". Check the branch your site builds from.`,
        );
      }
    } catch (error: unknown) {
      if (error instanceof HugoApiError && error.status === 404) {
        return fail(
          `GitHub cannot see ${candidate.owner}/${candidate.repo}. Check the name, and that the token has access to this repository.`,
        );
      }
      return fail(error instanceof Error ? error.message : 'GitHub could not be reached.');
    }

    // 2. The content folder, which is the field most likely to be wrong,
    //    because themes disagree about where posts live.
    let postCount: number;
    try {
      const entries = await this.contents.listDirectory(candidate.contentPath);
      postCount = entries.filter(
        (entry) => entry.type === 'file' && /\.(md|markdown)$/i.test(entry.name),
      ).length;
    } catch (error: unknown) {
      if (error instanceof HugoApiError && error.status === 404) {
        return fail(
          `There is no folder called "${candidate.contentPath}" on ${candidate.branch}. Most Hugo sites use content/posts.`,
        );
      }
      return fail(error instanceof Error ? error.message : 'GitHub could not be reached.');
    }

    // 3. Does this look like Hugo? A warning rather than a blocker: someone may
    //    keep their config somewhere unusual, and refusing to connect over a
    //    guess would be worse than saying so.
    const looksLikeHugo = await this.hasHugoConfig();

    return { ok: true, problem: null, looksLikeHugo, postCount };
  }

  private async hasHugoConfig(): Promise<boolean> {
    try {
      const root = await this.contents.listDirectory('');
      const names = new Set(root.map((entry) => entry.name.toLowerCase()));
      // A `config/` directory is Hugo's other supported layout.
      return (
        HUGO_CONFIG_FILES.some((file) => names.has(file)) ||
        root.some((entry) => entry.type === 'dir' && entry.name.toLowerCase() === 'config')
      );
    } catch {
      // Not being able to list the root is not a reason to block a connection
      // whose branch and content folder both checked out.
      return false;
    }
  }
}
