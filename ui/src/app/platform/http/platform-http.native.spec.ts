import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  PLATFORM_ARTICLE_READ,
  PLATFORM_CONNECTORS,
  PLATFORM_FEED_READ,
  publicMediaProbe,
} from './platform-http.native';

let image: {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  removeAttribute: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        image = { src: '', onload: null, onerror: null, removeAttribute: vi.fn() };
        return image;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

it('checks decoded images through the native protocol instead of blocked web fetch', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const pending = publicMediaProbe(
    'https://cdn.example/thumbnail.png',
    new AbortController().signal,
  );
  expect(image.src).toContain('native-image');
  expect(new URL(image.src).searchParams.get('url')).toBe('https://cdn.example/thumbnail.png');
  image.onload!();
  await expect(pending).resolves.toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  expect(image.onload).toBeNull();
});

it('reports refused/broken images and aborts without leaving listeners attached', async () => {
  const controller = new AbortController();
  const pending = publicMediaProbe('https://cdn.example/thumbnail.png', controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(image.onload).toBeNull();
  expect(image.onerror).toBeNull();
  expect(image.removeAttribute).toHaveBeenCalledWith('src');
  const broken = publicMediaProbe('https://cdn.example/broken', new AbortController().signal);
  image.onerror!();
  await expect(broken).rejects.toThrow('Native image probe failed');
});

it('invokes only the typed public feed command and exposes native failure messages', async () => {
  const invoke = vi.fn().mockResolvedValue('<rss><channel/></rss>');
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  const read = TestBed.inject(PLATFORM_FEED_READ)!;
  expect(await read('https://publisher.example/rss')).toBe('<rss><channel/></rss>');
  expect(invoke).toHaveBeenCalledExactlyOnceWith('public_feed_get', {
    url: 'https://publisher.example/rss',
  });
  invoke.mockRejectedValue({ kind: 'policy', message: 'Private destinations are blocked.' });
  await expect(read('http://127.0.0.1/rss')).rejects.toThrow('Private destinations are blocked.');
});

it('passes only the URL to native article fetching and preserves response metadata', async () => {
  const response = {
    status: 200,
    finalUrl: 'https://publisher.example/final',
    body: '<html></html>',
  };
  const invoke = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  expect(await TestBed.inject(PLATFORM_ARTICLE_READ)!('https://publisher.example/start')).toEqual(
    response,
  );
  expect(invoke).toHaveBeenCalledExactlyOnceWith('public_article_get', {
    url: 'https://publisher.example/start',
  });
});

it('native connector bridge limits raw credentials to connect and normalizes failures', async () => {
  const handle = 'native-connector:' + 'a'.repeat(43);
  const invoke = vi.fn().mockResolvedValue(handle);
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  const connectors = TestBed.inject(PLATFORM_CONNECTORS)!;
  expect(await connectors.connect('mataroa', 'private-key')).toBe(handle);
  expect(invoke).toHaveBeenLastCalledWith('connector_connect', {
    provider: 'mataroa',
    token: 'private-key',
    domain: null,
    workspace: null,
    handle: null,
  });
  await connectors.request({
    provider: 'mataroa',
    handle,
    url: 'https://mataroa.blog/api/posts/',
    method: 'GET',
  });
  expect(invoke).toHaveBeenLastCalledWith('connector_request', {
    provider: 'mataroa',
    handle,
    url: 'https://mataroa.blog/api/posts/',
    method: 'GET',
    body: null,
    workspace: null,
  });
  invoke.mockRejectedValue({ kind: 'credentials', message: 'OS store locked' });
  await expect(connectors.forget(handle)).rejects.toThrow('OS store locked');
});
