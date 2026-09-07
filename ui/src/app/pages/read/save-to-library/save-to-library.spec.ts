import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SaveToLibrary } from './save-to-library';
import { ReaderLibrary } from '../../../providers/read/reader-library';
import { Status } from '../../../models';

/** A post with `chars` characters of prose. */
function post(chars: number, over: Partial<Status> = {}): Status {
  return {
    id: '900',
    content: `<p>${'word word '.repeat(Math.ceil(chars / 10)).slice(0, chars)}</p>`,
    url: 'https://social.example/@eve/900',
    account: { id: '7', username: 'eve', acct: 'eve' },
    media_attachments: [],
    ...over,
  } as unknown as Status;
}

function render(status: Status) {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(SaveToLibrary);
  fixture.componentRef.setInput('status', status);
  fixture.detectChanges();
  return fixture;
}

const buttonIn = (fixture: ReturnType<typeof render>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector('button');

describe('SaveToLibrary', () => {
  beforeEach(() => localStorage.clear());

  /**
   * The control's whole restraint. A row that is not a document gets nothing —
   * the alternative is a third keep-for-later button on every post in the
   * timeline, beside two that already mean something adjacent.
   */
  it('offers nothing on an ordinary short post', () => {
    const fixture = render(post(80));
    expect(buttonIn(fixture)).toBeNull();
  });

  it('offers to save a long post', () => {
    const fixture = render(post(900));
    expect(buttonIn(fixture)).not.toBeNull();
  });

  it('offers to save an RSS item however short it is', () => {
    // An RSS item is an article by construction; the row is the headline, not
    // the piece, so its length says nothing.
    const fixture = render(post(30, { provider: 'rss' } as Partial<Status>));
    expect(buttonIn(fixture)).not.toBeNull();
  });

  it('saves onto the intend shelf and takes it off again', () => {
    const fixture = render(post(900));
    const library = TestBed.inject(ReaderLibrary);

    buttonIn(fixture)!.click();
    fixture.detectChanges();

    expect(library.get('900')?.shelf).toBe('intend');
    expect(library.get('900')?.title).toContain('word');
    expect(buttonIn(fixture)!.getAttribute('aria-pressed')).toBe('true');

    buttonIn(fixture)!.click();
    fixture.detectChanges();

    expect(library.has('900')).toBe(false);
  });

  /**
   * The row underneath the control opens the post. A save that also navigated
   * would take the reader to the thing they just said they would read later.
   */
  it('does not let the click reach the row underneath', () => {
    const fixture = render(post(900));
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    let reachedRow = false;
    (fixture.nativeElement as HTMLElement).addEventListener('click', () => (reachedRow = true));

    buttonIn(fixture)!.dispatchEvent(event);

    expect(reachedRow).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  /**
   * A post read from a server we hold no account on is addressed by an encoded
   * route ref, not by its remote id — storing the wrong one produced library
   * rows whose links 404.
   */
  it('shelves a remote post under the id its link uses', () => {
    const fixture = render(
      post(900, {
        provider: 'anonymous-mastodon',
        providerRef: { server: 'https://graz.social', statusId: '117' },
      } as Partial<Status>),
    );
    buttonIn(fixture)!.click();

    const ids = Object.keys(TestBed.inject(ReaderLibrary).snapshot());
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^anonymous-status\./);
  });
});
