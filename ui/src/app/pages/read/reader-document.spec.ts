import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import {
  chainTextLength,
  DOCUMENT_MIN_CHARS,
  documentTitle,
  isDocument,
  readerChain,
} from './reader-document';

function makeStatus(id: string, accountId: string, inReplyToId: string | null = null): Status {
  return {
    id,
    in_reply_to_id: inReplyToId,
    account: { id: accountId, acct: `user${accountId}` },
    content: `<p>${id}</p>`,
  } as Status;
}

describe('readerChain', () => {
  it('returns empty for an empty thread', () => {
    expect(readerChain([])).toEqual([]);
  });

  it('returns just the root for a single post', () => {
    const root = makeStatus('1', 'a');
    expect(readerChain([root])).toEqual([root]);
  });

  it('follows the author replying to their own previous post', () => {
    const p1 = makeStatus('1', 'a');
    const p2 = makeStatus('2', 'a', '1');
    const p3 = makeStatus('3', 'a', '2');
    expect(readerChain([p1, p2, p3]).map((s) => s.id)).toEqual(['1', '2', '3']);
  });

  it("excludes other people's replies and continues the author chain past them", () => {
    const p1 = makeStatus('1', 'a');
    const other = makeStatus('2', 'b', '1');
    const p3 = makeStatus('3', 'a', '1');
    const p4 = makeStatus('4', 'a', '3');
    expect(readerChain([p1, other, p3, p4]).map((s) => s.id)).toEqual(['1', '3', '4']);
  });

  it("does not include the author's side-replies to other people", () => {
    const p1 = makeStatus('1', 'a');
    const other = makeStatus('2', 'b', '1');
    // The author replies to `other`, not to their own chain: not part of the article.
    const aside = makeStatus('3', 'a', '2');
    expect(readerChain([p1, other, aside]).map((s) => s.id)).toEqual(['1']);
  });

  it('handles storms where every self-reply points at the root', () => {
    const p1 = makeStatus('1', 'a');
    const p2 = makeStatus('2', 'a', '1');
    const p3 = makeStatus('3', 'a', '1');
    const p4 = makeStatus('4', 'a', '1');
    expect(readerChain([p1, p2, p3, p4]).map((s) => s.id)).toEqual(['1', '2', '3', '4']);
  });

  it('stops when a different account continues the thread', () => {
    const p1 = makeStatus('1', 'a');
    const p2 = makeStatus('2', 'a', '1');
    const hijack = makeStatus('3', 'b', '2');
    expect(readerChain([p1, p2, hijack]).map((s) => s.id)).toEqual(['1', '2']);
  });
});

/** `n` characters of prose, wrapped in a paragraph the way a real post is. */
function prose(n: number): string {
  return `<p>${'word '.repeat(Math.ceil(n / 5)).slice(0, n)}</p>`;
}

function contentPost(id: string, content: string, provider?: string): Status {
  return {
    id,
    content,
    provider,
    in_reply_to_id: null,
    account: { id: 'a', username: 'a', acct: 'a', display_name: 'A' },
  } as unknown as Status;
}

describe('what counts as a document', () => {
  it('a short single post is not a document', () => {
    expect(isDocument([contentPost('1', prose(120))], false)).toBe(false);
  });

  it('a long single post is a document', () => {
    expect(isDocument([contentPost('1', prose(DOCUMENT_MIN_CHARS + 50))], false)).toBe(true);
  });

  it('a chain of short posts is a document — a storm is one piece of writing', () => {
    const chain = [
      contentPost('1', prose(80)),
      contentPost('2', prose(80)),
      contentPost('3', prose(80)),
    ];
    expect(chainTextLength(chain)).toBeLessThan(DOCUMENT_MIN_CHARS);
    expect(isDocument(chain, false)).toBe(true);
  });

  it('an RSS item is a document however short its teaser', () => {
    expect(isDocument([contentPost('1', prose(30), 'rss')], false)).toBe(true);
  });

  it('a short post with an expanded article is a document', () => {
    // The post is a sentence and a link; the thing being read is the article.
    expect(isDocument([contentPost('1', prose(60))], true)).toBe(true);
  });

  it('an empty chain is not a document', () => {
    expect(isDocument([], false)).toBe(false);
    expect(isDocument([], true)).toBe(false);
  });

  /**
   * The threshold counts prose, not markup. A post padded out with mention and
   * hashtag anchors is still a short post, and shelving it would fill the
   * library with exactly the ordinary chatter the rule exists to keep out.
   */
  it('markup does not count toward the length', () => {
    const links = '<a href="https://example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">x</a>'.repeat(12);
    expect(isDocument([contentPost('1', `<p>short${links}</p>`)], false)).toBe(false);
  });
});

describe('readerChain anchored on the post the reader opened', () => {
  /**
   * The bug this covers: a storm written as a reply to somebody else showed as
   * one post — theirs. `thread[0]` is the conversation root, which is not
   * necessarily the author of the thing being read.
   */
  it("takes the focused author's storm, not the thread root's single post", () => {
    const thread = [
      makeStatus('other', 'someone-else'),
      makeStatus('a1', 'author', 'other'),
      makeStatus('a2', 'author', 'a1'),
      makeStatus('a3', 'author', 'a2'),
    ];
    expect(readerChain(thread, 'a1').map((s) => s.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('walks back to the start when opened from the middle of a storm', () => {
    // The normal case for a link shared from the middle: without walking back,
    // the reader gets the second half of an article.
    const thread = [
      makeStatus('a1', 'author'),
      makeStatus('a2', 'author', 'a1'),
      makeStatus('a3', 'author', 'a2'),
    ];
    expect(readerChain(thread, 'a3').map((s) => s.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('stops walking back at a post by someone else', () => {
    // A storm that genuinely begins as a reply starts at the author's own first
    // line, not at the post they were answering.
    const thread = [
      makeStatus('other', 'someone-else'),
      makeStatus('a1', 'author', 'other'),
      makeStatus('a2', 'author', 'a1'),
    ];
    expect(readerChain(thread, 'a2').map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('falls back to the thread root when the focus id is not in the thread', () => {
    const thread = [makeStatus('a1', 'author'), makeStatus('a2', 'author', 'a1')];
    expect(readerChain(thread, 'missing').map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('behaves as before when no focus is given', () => {
    const thread = [makeStatus('a1', 'author'), makeStatus('a2', 'author', 'a1')];
    expect(readerChain(thread).map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('does not loop on a post that claims to reply to itself', () => {
    const self = makeStatus('a1', 'author', 'a1');
    expect(readerChain([self], 'a1').map((s) => s.id)).toEqual(['a1']);
  });

  it('leaves other people’s replies out of the middle of a storm', () => {
    const thread = [
      makeStatus('a1', 'author'),
      makeStatus('heckle', 'someone-else', 'a1'),
      makeStatus('a2', 'author', 'a1'),
    ];
    expect(readerChain(thread, 'a1').map((s) => s.id)).toEqual(['a1', 'a2']);
  });
});

/**
 * A tweetstorm has no headline, so the shelf has to name it from the prose.
 * Shared with the "save for later" control, which needs the same name from a
 * feed row — two implementations would let the shelf and the reader disagree
 * about what a document is called.
 */
describe('naming a document that has no title', () => {
  const titled = (content: string, url = 'https://example.test/1') =>
    documentTitle({ content, url } as Status);

  it('takes the first sentence', () => {
    expect(titled('<p>The first one. The second one.</p>')).toBe('The first one.');
  });

  it('strips markup rather than showing it', () => {
    expect(titled('<p>A <strong>bold</strong> claim.</p>')).toBe('A bold claim.');
  });

  it('decodes entities, so an ampersand is not spelled out on the shelf', () => {
    expect(titled('<p>Tea &amp; sympathy.</p>')).toBe('Tea & sympathy.');
  });

  it('truncates a long opening sentence with an ellipsis', () => {
    // 87 kept characters plus the ellipsis: the cap is on what is kept, so the
    // mark does not push the title past the width it was trimmed to fit.
    const title = titled(`<p>${'word '.repeat(40)}</p>`);
    expect(title).toHaveLength(88);
    expect(title.endsWith('…')).toBe(true);
  });

  it('falls back to the URL when there is no prose at all', () => {
    expect(titled('<p><img src="x"></p>', 'https://example.test/9')).toBe('https://example.test/9');
  });
});
