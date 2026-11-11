import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PasteCreated } from './paste-provider';
import { RentryProvider } from './rentry-provider';

describe('RentryProvider', () => {
  function setup(): [RentryProvider, HttpTestingController] {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    return [TestBed.inject(RentryProvider), TestBed.inject(HttpTestingController)];
  }

  it('creates an anonymous Markdown page and retains its edit code', () => {
    const [provider, http] = setup();
    let result: PasteCreated | undefined;

    provider
      .create({
        title: 'A title',
        content: 'A browser draft',
        language: 'markdown',
        expiry: 'never',
        visibility: 'unlisted',
      })
      .subscribe((created) => (result = created));

    const request = http.expectOne('https://rentry.co/api/new');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.get('url')).toBe('');
    expect(request.request.body.get('edit_code')).toBe('');
    expect(request.request.body.get('text')).toBe('# A title\n\nA browser draft');
    request.flush({ status: '200', url: 'https://rentry.co/my-page', edit_code: 'secret' });

    expect(result).toEqual({
      slug: 'my-page',
      url: 'https://rentry.co/my-page',
      rawUrl: 'https://rentry.co/my-page/raw',
      editKey: 'secret',
    });
    http.verify();
  });

  it('updates and deletes with the locally stored edit code', () => {
    const [provider, http] = setup();
    let updated = false;
    let deleted = false;

    provider
      .update('my-page', 'secret', {
        title: '',
        content: 'Revised',
        language: 'markdown',
      })
      .subscribe(() => (updated = true));
    const update = http.expectOne('https://rentry.co/api/edit/my-page');
    expect(update.request.body.get('edit_code')).toBe('secret');
    expect(update.request.body.get('text')).toBe('Revised');
    update.flush({ status: 200 });

    provider.delete('my-page', 'secret').subscribe(() => (deleted = true));
    const remove = http.expectOne('https://rentry.co/api/delete/my-page');
    expect(remove.request.body.get('edit_code')).toBe('secret');
    remove.flush({ status: '200' });

    expect(updated).toBe(true);
    expect(deleted).toBe(true);
    http.verify();
  });

  it('surfaces API-level failures returned with HTTP 200', () => {
    const [provider, http] = setup();
    let message = '';

    provider.delete('gone', 'wrong').subscribe({
      error: (error: Error) => (message = error.message),
    });
    http
      .expectOne('https://rentry.co/api/delete/gone')
      .flush({ status: '400', content: 'Invalid edit code' });

    expect(message).toBe('Invalid edit code');
    http.verify();
  });
});
