import { Component, HostListener, inject, input, effect, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GradedQuery, SearchContext, SearchHelper, SearchHelperResult } from '../search-helper';
import { PageDiagnostics } from '../../../page-diagnostics';

// i18n pages.search.helper.notTried: not tried
// i18n pages.search.helper.searchFailed: search failed
// i18n pages.search.helper.noResults: no results
// i18n pages.search.helper.result.one: {{count}} result
// i18n pages.search.helper.result.other: {{count}} results
// i18n pages.search.helper.summaryNothingWorked: Nothing returned {{threshold}}+ results, even after rewriting. Edit the best guess below — {{calls}} tried.
// i18n pages.search.helper.summaryFirstWorked: The first suggestion worked{{rewritten}} — {{calls}} tried.
// i18n pages.search.helper.summarySuggestionWorked: Suggestion {{position}} worked{{rewritten}} — {{calls}} tried.
// i18n pages.search.helper.rewrittenNote: , after one rewrite
// i18n pages.search.helper.callsUsed.one: {{count}} search
// i18n pages.search.helper.callsUsed.other: {{count}} searches
// i18n pages.search.helper.couldNotReachModel: Couldn't reach the model.
// i18n pages.search.helper.title: 🤖 Help me search
// i18n pages.search.helper.close: Close
// i18n pages.search.helper.intro: Describe what you're after in a sentence. You'll get a Mastodon search query you can edit before running it.
// i18n pages.search.helper.whatAreYouLookingFor: What are you looking for?
// i18n pages.search.helper.thinking: Thinking…
// i18n pages.search.helper.suggestQueries: Suggest queries
// i18n pages.search.helper.cancel: Cancel
// i18n pages.search.helper.busyStatus: Asking the model, then trying its suggestions until one returns results.
// i18n pages.search.helper.tryInOrderNote: Suggestions are tried in order and stop at the first that works, so later ones may be untried. Click any of them to use it instead.
// i18n pages.search.helper.yourQuery: Your query
// i18n pages.search.helper.useSearch: Use search

/**
 * "Describe what you're looking for" → a runnable Mastodon query.
 *
 * The dialog never runs a search itself. It hands a query back to the search
 * page, pre-filled into a textarea the user can edit first — the model
 * proposes, the user decides. That is the same shape as the tag helper, and it
 * is deliberate: nothing an LLM produces here takes effect without a human
 * reading it.
 */
@Component({
  selector: 'app-search-helper-dialog',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './search-helper-dialog.html',
  styleUrl: './search-helper-dialog.css',
})
export class SearchHelperDialog {
  private helper = inject(SearchHelper);
  private diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);

  /**
   * Whatever is in the search box, and the state of the widgets around it.
   *
   * Opening the helper with an empty box and a placeholder full of someone
   * else's example made the user retype what they had already typed. Their
   * words are the better starting point, even when they are only two of them.
   */
  readonly seed = input('');
  readonly context = input.required<SearchContext>();

  /** The chosen query. The page fills its search box and runs the normal path. */
  readonly useQuery = output<string>();
  readonly closed = output<void>();

  protected request = signal('');
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected result = signal<SearchHelperResult | null>(null);
  /** The editable query. Seeded from the winner, then owned by the user. */
  protected draft = signal('');

  constructor() {
    // Seeding once on open, not tracking: the search box keeps changing while
    // this is up (the page rewrites it when a query is used) and dragging the
    // textarea along would overwrite whatever the user was typing.
    effect(() => {
      const seed = this.seed().trim();
      if (seed) {
        this.request.set(seed);
      }
    });
  }

  async ask(): Promise<void> {
    const request = this.request().trim();
    if (!request || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.result.set(null);
    try {
      const result = await this.helper.run(request, this.context());
      this.result.set(result);
      // Seed with whatever worked; failing that, the model's best guess, so the
      // user always has something to edit rather than an empty box.
      this.draft.set(result.winner ?? result.queries[0] ?? '');
    } catch (error: unknown) {
      this.diagnostics.error('SearchHelper', 'run:error', error, {
        requestLength: request.length,
      });
      this.error.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate<string>('pages.search.helper.couldNotReachModel'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  /** Put a specific candidate in the editor without running anything. */
  pick(query: string): void {
    this.draft.set(query);
  }

  /**
   * What happened to one suggestion, or undefined when it was never tried.
   *
   * Every suggestion is listed, not just the tried ones: short-circuiting saves
   * API calls, but the untried candidates are still the model's suggestions and
   * are often what you actually want. "Not tried" is a state, not a reason to
   * hide something.
   */
  protected attemptFor(result: SearchHelperResult, query: string): GradedQuery | undefined {
    return result.attempts.find((attempt) => attempt.query === query);
  }

  use(): void {
    const query = this.draft().trim();
    if (query) {
      this.useQuery.emit(query);
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }

  /** "3 results" / "no results" / "search failed" / "not tried" for one suggestion. */
  protected outcomeLabel(attempt: GradedQuery | undefined): string {
    if (!attempt) {
      return this.transloco.translate<string>('pages.search.helper.notTried');
    }
    if (attempt.count === null) {
      return this.transloco.translate<string>('pages.search.helper.searchFailed');
    }
    if (attempt.count === 0) {
      return this.transloco.translate<string>('pages.search.helper.noResults');
    }
    return this.transloco.translate<string>(
      attempt.count === 1 ? 'pages.search.helper.result.one' : 'pages.search.helper.result.other',
      { count: attempt.count },
    );
  }

  /** The one-line summary above the editor. */
  protected summary(result: SearchHelperResult): string {
    const calls = this.transloco.translate<string>(
      result.callsUsed === 1
        ? 'pages.search.helper.callsUsed.one'
        : 'pages.search.helper.callsUsed.other',
      { count: result.callsUsed },
    );
    if (!result.winner) {
      return this.transloco.translate<string>('pages.search.helper.summaryNothingWorked', {
        threshold: result.threshold,
        calls,
      });
    }
    const position = result.attempts.length;
    const rewritten = result.refined
      ? this.transloco.translate<string>('pages.search.helper.rewrittenNote')
      : '';
    return position === 1
      ? this.transloco.translate<string>('pages.search.helper.summaryFirstWorked', {
          rewritten,
          calls,
        })
      : this.transloco.translate<string>('pages.search.helper.summarySuggestionWorked', {
          position,
          rewritten,
          calls,
        });
  }
}
