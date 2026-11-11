import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { parseMessageStatusRouteRef } from './message-payload';
import { PasteCreated } from './paste-provider';
import { TinyurlProvider } from './tinyurl-provider';

const INPUT = {
  title: '',
  content: 'why did the chicken cross the road?',
  language: 'plaintext',
  expiry: 'never',
  visibility: 'unlisted',
} as const;

describe('TinyurlProvider', () => {
  function setup(): [TinyurlProvider, HttpTestingController] {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    return [TestBed.inject(TinyurlProvider), TestBed.inject(HttpTestingController)];
  }

  it('shortens the message URL via TinyURL and returns the short link', () => {
    const [provider, http] = setup();
    let result: PasteCreated | undefined;

    provider.create(INPUT).subscribe((created) => (result = created));

    const request = http.expectOne((r) => r.url === 'https://tinyurl.com/api-create.php');
    expect(request.request.responseType).toBe('text');
    const target = request.request.params.get('url')!;
    const parsedTarget = new URL(target);
    expect(parsedTarget.pathname).toMatch(/\/message\/message-status\./);
    expect(parsedTarget.search).toBe('');
    expect(parseMessageStatusRouteRef(parsedTarget.pathname.split('/').at(-1)!)).toEqual({
      content: 'why did the chicken cross the road?',
      spoiler: '',
      language: 'plaintext',
    });
    expect(request.request.urlWithParams).not.toContain('%25');
    request.flush('https://tinyurl.com/22qwvuhy');

    expect(result?.url).toBe('https://tinyurl.com/22qwvuhy');
    expect(result?.slug).toBe('22qwvuhy');
    expect(result?.rawUrl).toContain('/message/message-status.');
    expect(result?.editKey).toBe('');
    http.verify();
  });

  it('trims whitespace from the plain-text response body', () => {
    const [provider, http] = setup();
    let result: PasteCreated | undefined;

    provider.create(INPUT).subscribe((created) => (result = created));
    http
      .expectOne((r) => r.url === 'https://tinyurl.com/api-create.php')
      .flush('  https://tinyurl.com/abc123\n');

    expect(result?.url).toBe('https://tinyurl.com/abc123');
    http.verify();
  });

  it('errors when TinyURL returns a non-URL body (e.g. an error string)', () => {
    const [provider, http] = setup();
    let message = '';

    provider.create(INPUT).subscribe({ error: (e: Error) => (message = e.message) });
    http
      .expectOne((r) => r.url === 'https://tinyurl.com/api-create.php')
      .flush('Error: rate limited');

    expect(message).toBe('Error: rate limited');
    http.verify();
  });

  it('rejects edit and delete as unsupported', () => {
    const [provider, http] = setup();
    let editError = '';
    let deleteError = '';

    provider
      .update('x', '', { title: '', content: 'y', language: 'plaintext' })
      .subscribe({ error: (e: Error) => (editError = e.message) });
    provider.delete('x', '').subscribe({ error: (e: Error) => (deleteError = e.message) });

    expect(editError).toContain('cannot be edited');
    expect(deleteError).toContain('cannot be deleted');
    http.verify();
  });
});
