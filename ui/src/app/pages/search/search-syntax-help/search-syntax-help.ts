import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

interface SyntaxRow {
  /** The operator as you would type it. */
  syntax: string;
  label: string;
  /** A worked example, when the operator alone doesn't make the shape obvious. */
  example?: string;
}

interface SyntaxGroup {
  title: string;
  /** One sentence of context above the table, where the group needs it. */
  note?: string;
  rows: SyntaxRow[];
}

/** Which network's operators to document. */
export type SyntaxNetwork = 'mastodon' | 'bluesky';

// i18n pages.search.syntax.words: Words
// i18n pages.search.syntax.wordsNote: Bare words match loosely. The operators tighten that up.
// i18n pages.search.syntax.wordMustAppear: The word must appear
// i18n pages.search.syntax.wordMustNotAppear: The word must not appear
// i18n pages.search.syntax.wordsMustAppearTogether: The words must appear together
// i18n pages.search.syntax.whoAndWhen: Who and when
// i18n pages.search.syntax.postedByAccount: Posted by this account
// i18n pages.search.syntax.postedOnOrAfter: Posted on or after this date
// i18n pages.search.syntax.postedOnOrBefore: Posted on or before this date
// i18n pages.search.syntax.postedBeforeThisDate: Posted before this date
// i18n pages.search.syntax.writtenInLanguage: Written in this language (two-letter code)
// i18n pages.search.syntax.whatIsInPost: What is in the post
// i18n pages.search.syntax.hasMedia: Has an image, video or audio attachment
// i18n pages.search.syntax.hasPoll: Has a poll
// i18n pages.search.syntax.isReply: Is a reply to another post
// i18n pages.search.syntax.isNotReply: Is not a reply
// i18n pages.search.syntax.isSensitive: Is marked sensitive
// i18n pages.search.syntax.isNotSensitive: Is not marked sensitive
// i18n pages.search.syntax.whereToLook: Where to look
// i18n pages.search.syntax.whereToLookNote: Without one of these, the server picks its own default scope.
// i18n pages.search.syntax.searchAllPublic: Search all public posts
// i18n pages.search.syntax.searchLibraryOnly: Search only posts you wrote or interacted with
// i18n pages.search.syntax.bskyWordsNote: Bare words all have to match. Quotes make them match as a phrase.
// i18n pages.search.syntax.allWordsMustAppear: All of these words must appear
// i18n pages.search.syntax.mentionsAccount: Mentions this account
// i18n pages.search.syntax.writtenInLanguageBsky: Written in this language (two-letter code)
// i18n pages.search.syntax.tagsAndLinks: Tags and links
// i18n pages.search.syntax.tagsAndLinksNote: Two tags narrow the results — they must both be present, not either one.
// i18n pages.search.syntax.taggedWithHashtag: Tagged with this hashtag
// i18n pages.search.syntax.sameThingWrittenOut: The same thing, written out
// i18n pages.search.syntax.linksToDomain: Links to this domain
// i18n pages.search.syntax.linksToExactUrl: Links to this exact URL
// i18n pages.search.syntax.mastodonTitle: Mastodon search syntax
// i18n pages.search.syntax.blueskyTitle: Bluesky search syntax
// i18n pages.search.syntax.intro: These work in a <strong>post</strong> search — and in an <strong>account</strong> search, which runs this same post search as one of its two halves and groups the hits by author (they narrow that half only; names and bios are matched as plain text). Hashtag search matches plain text only.
// i18n pages.search.syntax.close: Close
// i18n pages.search.syntax.blueskyFooter: Combine them freely, separated by spaces — everything you write must match: <code>rust from:pfrazee.com since:2026-01-01 #compiler</code>. An operator Bluesky doesn't recognise is treated as a <em>search word</em> rather than ignored, so a misspelled one usually returns nothing at all.
// i18n pages.search.syntax.mastodonFooter: Combine them freely, separated by spaces — everything you write must match: <code>+rust from:&#64;a&#64;b.social after:2026-01-01 -is:reply</code>. Anything the server doesn't recognise is quietly ignored, so if a query returns more than you expected, check the spelling of the operator.

/**
 * The operator reference, sourced from `mastodon-query-serializer.ts`.
 *
 * These are exactly the operators the Advanced form emits, and no more. That
 * matters: an operator Mastodon does not honour fails *silently* by returning
 * more results than asked for, so documenting a hopeful one here would teach
 * people to write queries that quietly lie to them (see the DSL trust bet in
 * `sprint/search-2-serializer-and-explain.md`).
 */
const GROUPS: SyntaxGroup[] = [
  {
    title: 'pages.search.syntax.words',
    note: 'pages.search.syntax.wordsNote',
    rows: [
      { syntax: '+word', label: 'pages.search.syntax.wordMustAppear', example: '+rust +compiler' },
      {
        syntax: '-word',
        label: 'pages.search.syntax.wordMustNotAppear',
        example: 'rust -gamedev',
      },
      {
        syntax: '"exact phrase"',
        label: 'pages.search.syntax.wordsMustAppearTogether',
        example: '"borrow checker"',
      },
    ],
  },
  {
    title: 'pages.search.syntax.whoAndWhen',
    rows: [
      {
        syntax: 'from:@user@host',
        label: 'pages.search.syntax.postedByAccount',
        example: 'from:@Gargron@mastodon.social',
      },
      {
        syntax: 'after:YYYY-MM-DD',
        label: 'pages.search.syntax.postedOnOrAfter',
        example: 'after:2026-01-01',
      },
      {
        syntax: 'before:YYYY-MM-DD',
        label: 'pages.search.syntax.postedOnOrBefore',
        example: 'before:2026-07-01',
      },
      {
        syntax: 'language:xx',
        label: 'pages.search.syntax.writtenInLanguage',
        example: 'language:en',
      },
    ],
  },
  {
    title: 'pages.search.syntax.whatIsInPost',
    rows: [
      { syntax: 'has:media', label: 'pages.search.syntax.hasMedia' },
      { syntax: 'has:poll', label: 'pages.search.syntax.hasPoll' },
      { syntax: 'is:reply', label: 'pages.search.syntax.isReply' },
      { syntax: '-is:reply', label: 'pages.search.syntax.isNotReply' },
      { syntax: 'is:sensitive', label: 'pages.search.syntax.isSensitive' },
      { syntax: '-is:sensitive', label: 'pages.search.syntax.isNotSensitive' },
    ],
  },
  {
    title: 'pages.search.syntax.whereToLook',
    note: 'pages.search.syntax.whereToLookNote',
    rows: [
      { syntax: 'in:public', label: 'pages.search.syntax.searchAllPublic' },
      { syntax: 'in:library', label: 'pages.search.syntax.searchLibraryOnly' },
    ],
  },
];

/**
 * Bluesky's operators, sourced from `bluesky-query-serializer.ts`.
 *
 * Same rule as the Mastodon list and for the same reason: these are exactly the
 * ones `app.bsky.feed.searchPosts` takes as parameters. Bluesky's failure mode
 * is worse than Mastodon's, in fact — an operator it does not know is not
 * ignored, it is treated as a *search word*, so `has:media` quietly searches for
 * the literal text "has:media" and returns nothing.
 */
const BLUESKY_GROUPS: SyntaxGroup[] = [
  {
    title: 'pages.search.syntax.words',
    note: 'pages.search.syntax.bskyWordsNote',
    rows: [
      {
        syntax: 'word word',
        label: 'pages.search.syntax.allWordsMustAppear',
        example: 'rust compiler',
      },
      {
        syntax: '"exact phrase"',
        label: 'pages.search.syntax.wordsMustAppearTogether',
        example: '"borrow checker"',
      },
    ],
  },
  {
    title: 'pages.search.syntax.whoAndWhen',
    rows: [
      {
        syntax: 'from:handle',
        label: 'pages.search.syntax.postedByAccount',
        example: 'from:pfrazee.com',
      },
      {
        syntax: 'mentions:handle',
        label: 'pages.search.syntax.mentionsAccount',
        example: 'mentions:jay.bsky.team',
      },
      {
        syntax: 'since:YYYY-MM-DD',
        label: 'pages.search.syntax.postedOnOrAfter',
        example: 'since:2026-01-01',
      },
      {
        syntax: 'until:YYYY-MM-DD',
        label: 'pages.search.syntax.postedBeforeThisDate',
        example: 'until:2026-07-01',
      },
      {
        syntax: 'lang:xx',
        label: 'pages.search.syntax.writtenInLanguageBsky',
        example: 'lang:en',
      },
    ],
  },
  {
    title: 'pages.search.syntax.tagsAndLinks',
    note: 'pages.search.syntax.tagsAndLinksNote',
    rows: [
      {
        syntax: '#tag',
        label: 'pages.search.syntax.taggedWithHashtag',
        example: '#angular #typescript',
      },
      { syntax: 'tag:name', label: 'pages.search.syntax.sameThingWrittenOut' },
      {
        syntax: 'domain:host',
        label: 'pages.search.syntax.linksToDomain',
        example: 'domain:github.com',
      },
      {
        syntax: 'url:address',
        label: 'pages.search.syntax.linksToExactUrl',
        example: 'url:https://example.com/post',
      },
    ],
  },
];

/**
 * The "Syntax?" cheat-sheet for the search bar, in two presentations.
 *
 * As a dialog (the default) it is deliberately the same shape as the
 * keyboard-shortcuts help: this is the second "here is what you can type"
 * reference in the app, and two references that look alike are one thing to
 * learn instead of two.
 *
 * With `[embedded]="true"` the same content renders bare, with no overlay and
 * no Close button, for the search page's idle state. That state used to show
 * trending posts, which filled the space without answering the question someone
 * staring at an empty search box actually has. One component rather than two
 * because the operator list must not be able to drift between them — it is
 * sourced from `mastodon-query-serializer.ts` and a stale copy would document
 * operators that silently do nothing.
 */
@Component({
  selector: 'app-search-syntax-help',
  imports: [NgTemplateOutlet, TranslocoPipe],
  template: `
    @if (embedded()) {
      <section class="embedded" aria-labelledby="search-syntax-title">
        <ng-container [ngTemplateOutlet]="body" />
      </section>
    } @else {
      <div
        class="overlay"
        role="presentation"
        tabindex="-1"
        (click)="closed.emit()"
        (keyup.escape)="closed.emit()"
      >
        <div
          class="dialog"
          role="dialog"
          aria-labelledby="search-syntax-title"
          (click)="$event.stopPropagation()"
          (keyup)="$event.stopPropagation()"
        >
          <ng-container [ngTemplateOutlet]="body" />
          <div class="actions">
            <button class="btn btn-outline" type="button" (click)="closed.emit()">
              {{ 'pages.search.syntax.close' | transloco }}
            </button>
          </div>
        </div>
      </div>
    }

    <ng-template #body>
      <h3 id="search-syntax-title">
        {{
          (network() === 'bluesky'
            ? 'pages.search.syntax.blueskyTitle'
            : 'pages.search.syntax.mastodonTitle'
          ) | transloco
        }}
      </h3>
      <p class="muted note" [innerHTML]="'pages.search.syntax.intro' | transloco"></p>
      <div class="groups">
        @for (group of groups(); track group.title) {
          <section>
            <h4>{{ group.title | transloco }}</h4>
            @if (group.note) {
              <p class="muted group-note">{{ group.note | transloco }}</p>
            }
            <table>
              <tbody>
                @for (row of group.rows; track row.syntax) {
                  <tr>
                    <td class="syntax">
                      <code>{{ row.syntax }}</code>
                    </td>
                    <td>
                      {{ row.label | transloco }}
                      @if (row.example) {
                        <span class="example"
                          ><code>{{ row.example }}</code></span
                        >
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }
      </div>
      @if (network() === 'bluesky') {
        <p
          class="muted note footer-note"
          [innerHTML]="'pages.search.syntax.blueskyFooter' | transloco"
        ></p>
      } @else {
        <p
          class="muted note footer-note"
          [innerHTML]="'pages.search.syntax.mastodonFooter' | transloco"
        ></p>
      }
    </ng-template>
  `,
  styles: `
    /* Embedded: no overlay, no card. The idle search page is already a panel,
       and nesting a second bordered box inside it reads as a modal that failed
       to open. h3 drops to the size of a section heading for the same reason. */
    .embedded h3 {
      font-size: 1.05em;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 110;
      padding: 16px;
    }
    .dialog {
      background: var(--col-bg);
      color: var(--text);
      border-radius: 16px;
      padding: 24px;
      width: 720px;
      max-width: 100%;
      max-height: 85vh;
      overflow-y: auto;
    }
    h3 {
      margin: 0 0 4px;
    }
    .note {
      margin: 0 0 16px;
      font-size: 0.9em;
    }
    .groups {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    h4 {
      margin: 0 0 4px;
    }
    .group-note {
      margin: 0 0 8px;
      font-size: 0.85em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.9em;
    }
    td {
      padding: 3px 8px 3px 0;
      vertical-align: top;
    }
    .syntax {
      white-space: nowrap;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .syntax code {
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 0.95em;
    }
    .example {
      display: block;
      margin-top: 2px;
      font-size: 0.9em;
      opacity: 0.75;
    }
    .footer-note {
      margin: 16px 0 0;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
  `,
})
export class SearchSyntaxHelp {
  /** Render bare, without the overlay or the Close button. */
  readonly embedded = input(false);

  /**
   * Whose operators to document.
   *
   * One component rather than two, for the same reason the Mastodon list is
   * generated from one constant: the two dialects are similar enough that two
   * separate references would be read as one and misremembered. Showing the same
   * reference in the same shape, with the operators swapped, makes the
   * differences — `after:` vs `since:`, `+word` vs bare words — visible.
   */
  readonly network = input<SyntaxNetwork>('mastodon');

  readonly closed = output<void>();

  protected readonly groups = computed(() =>
    this.network() === 'bluesky' ? BLUESKY_GROUPS : GROUPS,
  );
}
