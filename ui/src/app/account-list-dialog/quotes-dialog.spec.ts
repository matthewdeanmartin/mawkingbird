import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyPostControls } from '../providers/bluesky/bluesky-post-controls';
import { QuotesDialog } from './quotes-dialog';

const URI = 'at://did:plc:me/app.bsky.feed.post/1';
const QUOTE_URI = 'at://did:plc:q/app.bsky.feed.post/9';

/** The posts that quoted a post, from the server or from Bluesky. */
describe('QuotesDialog', () => {
  let http: HttpTestingController;
  let setQuoteDetached: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setQuoteDetached = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: BlueskyPostControls, useValue: { setQuoteDetached } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(QuotesDialog);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture;
  }

  it('lists Mastodon quotes from the server, each opening its thread', () => {
    const f = render({ statusId: '42' });
    http.expectOne('/api/v1/statuses/42/quotes').flush([
      {
        id: '77',
        content: '<p>So true</p>',
        account: { id: '5', username: 'ann', display_name: 'Ann', avatar: '' },
      },
    ]);
    f.detectChanges();

    const row = (f.nativeElement as HTMLElement).querySelector('a.account-row')!;
    expect(row.getAttribute('href')).toBe('/statuses/77');
    expect(row.textContent).toContain('Ann');
    expect(row.textContent).toContain('So true');
  });

  it('lists Bluesky quotes from getQuotes and lets the author detach one', async () => {
    const f = render({ statusId: `bsky:${URI}`, blueskyUri: URI, canDetach: true });
    const req = http.expectOne((r) => r.url.endsWith('/xrpc/app.bsky.feed.getQuotes'));
    expect(req.request.params.get('uri')).toBe(URI);
    req.flush({
      posts: [
        {
          uri: QUOTE_URI,
          cid: 'c9',
          author: { did: 'did:plc:q', handle: 'q.bsky.social' },
          record: { $type: 'app.bsky.feed.post', text: 'Look at this', createdAt: 'x' },
          indexedAt: 'x',
        },
      ],
    });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Look at this');

    const detach = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Detach',
    )!;
    detach.click();
    await f.whenStable();
    f.detectChanges();

    expect(setQuoteDetached).toHaveBeenCalledWith(URI, QUOTE_URI, true);
    expect(el.textContent).toContain('Reattach');
  });

  it('offers no detaching on someone else’s post', () => {
    const f = render({ statusId: `bsky:${URI}`, blueskyUri: URI });
    http
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.feed.getQuotes'))
      .flush({
        posts: [
          {
            uri: QUOTE_URI,
            cid: 'c9',
            author: { did: 'did:plc:q', handle: 'q.bsky.social' },
            record: { $type: 'app.bsky.feed.post', text: 'Hm', createdAt: 'x' },
            indexedAt: 'x',
          },
        ],
      });
    f.detectChanges();

    expect((f.nativeElement as HTMLElement).textContent).not.toContain('Detach');
  });
});
