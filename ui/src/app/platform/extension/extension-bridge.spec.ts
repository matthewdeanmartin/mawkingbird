import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXTENSION_PROTOCOL,
  ExtensionAccessNeeded,
  ExtensionBridge,
  extensionAccessOrigin,
  siteName,
} from './extension-bridge';

/**
 * A stand-in for the extension's content script: answers the page's posted
 * requests the way bridge/content.js does, from the same window and origin.
 */
function fakeExtension(answer: (request: Record<string, unknown>) => unknown) {
  document.documentElement.dataset['mawkingbirdExtension'] = EXTENSION_PROTOCOL;
  const received: Record<string, unknown>[] = [];
  vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
    const message = data as Record<string, unknown>;
    if (message['direction'] !== 'to-extension') return;
    received.push(message);
    queueMicrotask(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: EXTENSION_PROTOCOL,
            direction: 'to-page',
            id: message['id'],
            result: answer(message),
          },
          origin: window.location.origin,
          source: window,
        }),
      ),
    );
  });
  return received;
}

describe('ExtensionBridge', () => {
  beforeEach(() => TestBed.configureTestingModule({}));
  afterEach(() => {
    delete document.documentElement.dataset['mawkingbirdExtension'];
    vi.restoreAllMocks();
  });

  it('is absent, and sends nothing, without the extension', async () => {
    const post = vi.spyOn(window, 'postMessage');
    const bridge = TestBed.inject(ExtensionBridge);
    expect(bridge.present()).toBe(false);
    expect(await bridge.read('https://blog.example/feed', 'feed')).toMatchObject({
      ok: false,
      error: 'unavailable',
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('asks the extension through the page and returns its answer', async () => {
    const received = fakeExtension(() => ({
      ok: true,
      status: 200,
      finalUrl: 'https://blog.example/feed',
      contentType: 'application/rss+xml',
      body: '<rss/>',
    }));
    const bridge = TestBed.inject(ExtensionBridge);
    expect(bridge.present()).toBe(true);
    const read = await bridge.read('https://blog.example/feed', 'feed');
    expect(read).toMatchObject({ ok: true, body: '<rss/>' });
    expect(received[0]).toMatchObject({
      channel: EXTENSION_PROTOCOL,
      op: 'fetch',
      url: 'https://blog.example/feed',
      purpose: 'feed',
    });
  });

  it('ignores answers to other requests and from other origins', async () => {
    fakeExtension(() => ({ ok: true, granted: true }));
    const bridge = TestBed.inject(ExtensionBridge);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: EXTENSION_PROTOCOL, direction: 'to-page', id: 'other', result: 'x' },
        origin: 'https://evil.example',
        source: window,
      }),
    );
    expect(await bridge.requestAccess('https://blog.example')).toBe(true);
  });

  it('checks again when the grant answer was lost', async () => {
    const received = fakeExtension((request) =>
      request['op'] === 'requestAccess'
        ? { ok: false, error: 'unavailable' }
        : { ok: true, granted: true },
    );
    expect(await TestBed.inject(ExtensionBridge).requestAccess('https://blog.example')).toBe(true);
    expect(received.map((r) => r['op'])).toEqual(['requestAccess', 'hasAccess']);
  });
});

describe('extensionAccessOrigin and siteName', () => {
  it('finds the site in the error or its causes', () => {
    const needed = new ExtensionAccessNeeded('https://blog.example', 'Allow it.');
    expect(extensionAccessOrigin(needed)).toBe('https://blog.example');
    expect(extensionAccessOrigin(new Error('wrapped', { cause: needed }))).toBe(
      'https://blog.example',
    );
    expect(extensionAccessOrigin(new Error('plain'))).toBeNull();
    expect(extensionAccessOrigin(null)).toBeNull();
  });

  it('names a site without its scheme or www.', () => {
    expect(siteName('https://www.blog.example')).toBe('blog.example');
  });
});
