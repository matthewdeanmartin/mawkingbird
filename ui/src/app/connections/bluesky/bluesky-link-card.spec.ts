import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { BSKY_CARD_SERVICE, BlueskyLinkCard, firstLink } from './bluesky-link-card';

const EXTRACT = `${BSKY_CARD_SERVICE}/v1/extract`;
const IMAGE = `${BSKY_CARD_SERVICE}/v1/image?url=https%3A%2F%2Fexample.com%2Fog.png`;
const THUMB = { $type: 'blob', ref: { $link: 'bafy-thumb' }, mimeType: 'image/jpeg', size: 10 };

describe('firstLink', () => {
  it('finds the first web link and drops trailing sentence punctuation', () => {
    expect(firstLink('Read https://example.com/a?b=1. Then https://other.test')).toBe(
      'https://example.com/a?b=1',
    );
    expect(firstLink('(see https://example.com/page)')).toBe('https://example.com/page');
    expect(firstLink('no links here, just example.com')).toBeNull();
  });
});

/**
 * Mastodon builds link cards on its server; Bluesky leaves it to the client.
 * The card comes from Bluesky's own metadata service, and any failure posts
 * without a card rather than blocking.
 */
describe('BlueskyLinkCard', () => {
  let http: HttpTestingController;
  let uploadBlob: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 1200, height: 630, close: vi.fn() }),
    );
    uploadBlob = vi.fn(() => of({ blob: THUMB }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BlueskyApi, useValue: { uploadBlob } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('builds a card with title, description and an uploaded thumbnail', async () => {
    const card = TestBed.inject(BlueskyLinkCard).build('https://example.com/post', false);

    const extract = http.expectOne((r) => r.url === EXTRACT);
    expect(extract.request.params.get('url')).toBe('https://example.com/post');
    extract.flush({
      error: '',
      url: 'https://example.com/post',
      title: 'A post',
      description: 'About things',
      image: IMAGE,
    });
    const image = await vi.waitFor(() => http.expectOne(IMAGE));
    image.flush(new Blob(['png'], { type: 'image/png' }));

    await expect(card).resolves.toEqual({
      $type: 'app.bsky.embed.external',
      external: {
        uri: 'https://example.com/post',
        title: 'A post',
        description: 'About things',
        thumb: THUMB,
      },
    });
    expect(uploadBlob).toHaveBeenCalledOnce();
  });

  it('still makes a card when the image cannot be fetched', async () => {
    const card = TestBed.inject(BlueskyLinkCard).build('https://example.com/post', false);
    http.expectOne((r) => r.url === EXTRACT).flush({ title: 'A post', image: IMAGE });
    const image = await vi.waitFor(() => http.expectOne(IMAGE));
    image.error(new ProgressEvent('error'));

    const built = await card;
    expect(built?.external.title).toBe('A post');
    expect(built?.external.thumb).toBeUndefined();
  });

  it('gives no card when the page has nothing to show or the service fails', async () => {
    const service = TestBed.inject(BlueskyLinkCard);

    const empty = service.build('https://example.com/blank', false);
    http.expectOne((r) => r.url === EXTRACT).flush({ error: '', title: '', description: '' });
    await expect(empty).resolves.toBeNull();

    const failed = service.build('https://example.com/down', false);
    http
      .expectOne((r) => r.url === EXTRACT)
      .flush({ error: 'failed to fetch' }, { status: 500, statusText: 'Server Error' });
    await expect(failed).resolves.toBeNull();
  });
});
