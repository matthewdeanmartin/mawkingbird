import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isLive, TagCheck, TagHelper, TagHelperResult } from '../tag-helper';
import { PageDiagnostics } from '../../page-diagnostics';

/**
 * 🤖#️⃣ — hashtag suggestions for the post being written.
 *
 * Like the search helper, this never acts: it hands a list of tags back to the
 * compose box, and the user edits them first. Live tags are pre-selected; dead
 * ones are shown anyway (greyed, with the count) because "nobody uses this" is
 * useful information, and occasionally you want the tag regardless.
 */
// i18n compose.tagHelper.also: · also:
// i18n compose.tagHelper.cancel: Cancel
// i18n compose.tagHelper.close: Close
// i18n compose.tagHelper.intro: Tags are how people find posts outside their follows. These are checked against this server, so you can tell a tag people read from one that only sounds right.
// i18n compose.tagHelper.placeholder: rust compilers
// i18n compose.tagHelper.suggest: Suggest tags for this post
// i18n compose.tagHelper.title: 🤖#️⃣ Suggest hashtags
// i18n compose.tagHelper.useTags: Use tags
// i18n compose.tagHelper.working: Asking the model, then checking each tag for activity…
// i18n compose.tagHelper.writeFirst: Write something first.
// i18n compose.tagHelper.yourTags: Your tags

// i18n compose.tagHelper.unusedHere: unused here
// i18n compose.tagHelper.recentUses.one: {{count}} recent use
// i18n compose.tagHelper.recentUses.other: {{count}} recent uses
// i18n compose.tagHelper.lookups.one: {{count}} lookup
// i18n compose.tagHelper.lookups.other: {{count}} lookups
// i18n compose.tagHelper.summary.none: None of these are in use on this server — {{calls}}. Edit below, or post without tags.
// i18n compose.tagHelper.summary.noneRefined: None of these are in use on this server, after one rewrite — {{calls}}. Edit below, or post without tags.
// i18n compose.tagHelper.summary.some: {{count}} of these are in real use — {{calls}}.
// i18n compose.tagHelper.summary.someRefined: {{count}} of these are in real use, after one rewrite — {{calls}}.

@Component({
  selector: 'app-tag-helper-dialog',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './tag-helper-dialog.html',
  styleUrl: './tag-helper-dialog.css',
})
export class TagHelperDialog {
  private transloco = inject(TranslocoService);
  private helper = inject(TagHelper);
  private diagnostics = inject(PageDiagnostics);

  /** The post text being tagged. */
  readonly post = input.required<string>();

  readonly useTags = output<string[]>();
  readonly closed = output<void>();

  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected result = signal<TagHelperResult | null>(null);
  /** The editable, space-separated tag line. Seeded from the live tags. */
  protected draft = signal('');

  protected readonly isLive = isLive;

  async suggest(): Promise<void> {
    const post = this.post().trim();
    if (!post || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.result.set(null);
    try {
      const result = await this.helper.run(post);
      this.result.set(result);
      // Seed with what has traffic; fall back to everything suggested so the
      // user always has something to edit rather than an empty box.
      const seed = result.live.length ? result.live : result.checked.map((c) => c.tag);
      this.draft.set(seed.join(' '));
    } catch (error: unknown) {
      this.diagnostics.error('TagHelper', 'suggest:error', error, { postLength: post.length });
      this.error.set(error instanceof Error ? error.message : "Couldn't reach the model.");
    } finally {
      this.busy.set(false);
    }
  }

  /** Add or remove one tag from the editable line. */
  toggle(check: TagCheck): void {
    const tags = this.draftTags();
    const index = tags.findIndex((t) => t.toLowerCase() === check.tag.toLowerCase());
    if (index >= 0) {
      tags.splice(index, 1);
    } else {
      tags.push(check.tag);
    }
    this.draft.set(tags.join(' '));
  }

  protected selected(check: TagCheck): boolean {
    return this.draftTags().some((t) => t.toLowerCase() === check.tag.toLowerCase());
  }

  use(): void {
    const tags = this.draftTags();
    if (tags.length) {
      this.useTags.emit(tags);
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }

  /** The draft parsed into bare tag names, however the user punctuated it. */
  private draftTags(): string[] {
    return this.draft()
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);
  }

  protected usesLabel(check: TagCheck): string {
    if (check.uses === null) {
      return "couldn't check";
    }
    if (check.uses === 0) {
      return this.transloco.translate<string>('compose.tagHelper.unusedHere');
    }
    return this.transloco.translate<string>(
      check.uses === 1 ? 'compose.tagHelper.recentUses.one' : 'compose.tagHelper.recentUses.other',
      { count: check.uses },
    );
  }

  protected summary(result: TagHelperResult): string {
    // One whole key per variant rather than a sentence assembled from parts:
    // the count, the "after one rewrite" clause and the lookup tally sit in
    // different places in different languages.
    const calls = this.transloco.translate<string>(
      result.callsUsed === 1 ? 'compose.tagHelper.lookups.one' : 'compose.tagHelper.lookups.other',
      { count: result.callsUsed },
    );
    if (!result.live.length) {
      return this.transloco.translate<string>(
        result.refined ? 'compose.tagHelper.summary.noneRefined' : 'compose.tagHelper.summary.none',
        { calls },
      );
    }
    return this.transloco.translate<string>(
      result.refined ? 'compose.tagHelper.summary.someRefined' : 'compose.tagHelper.summary.some',
      { count: result.live.length, calls },
    );
  }
}
