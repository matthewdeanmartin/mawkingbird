import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PLATFORM_MEDIA } from '../../platform/http/platform-http';
import type { NativeMediaTransport } from '../../platform/http/connector-types';
import { Status } from '../../platform/api/models';
import { ClipboardHost, ImageActions, imageFileName } from './image-actions';

class FakeItem {
  constructor(readonly items: Record<string, Blob>) {}
}

function webHost(over: Partial<ClipboardHost> = {}): ClipboardHost & {
  written: FakeItem[][];
} {
  const written: FakeItem[][] = [];
  return {
    written,
    ClipboardItem: FakeItem as unknown as typeof ClipboardItem,
    clipboard: { write: vi.fn(async (items: ClipboardItems) => void written.push(items as never)) },
    fetch: vi.fn(async () => new Response(new Blob(['jpeg'], { type: 'image/jpeg' }))),
    toPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    ...over,
  };
}

function web(host: ClipboardHost): ImageActions {
  TestBed.configureTestingModule({});
  const actions = TestBed.inject(ImageActions);
  actions.host = host;
  return actions;
}

describe('ImageActions on the web (parity item 10)', () => {
  it('copies the picture as PNG through ClipboardItem', async () => {
    const host = webHost();
    const actions = web(host);
    expect(actions.canCopy).toBe(true);
    expect(actions.canSave).toBe(false);
    expect(await actions.copy('https://cdn.example/a.jpg')).toBe('Image copied.');
    expect(host.toPng).toHaveBeenCalled();
    const item = host.written[0][0];
    expect(Object.keys(item.items)).toEqual(['image/png']);
    expect(item.items['image/png'].type).toBe('image/png');
  });

  it('skips re-encoding when the image already is PNG', async () => {
    const host = webHost({
      fetch: vi.fn(
        async () => new Response(new Blob(['png']), { headers: { 'Content-Type': 'image/png' } }),
      ),
    });
    await web(host).copy('https://cdn.example/a.png');
    expect(host.toPng).not.toHaveBeenCalled();
  });

  it('is hidden where the browser has no ClipboardItem or clipboard.write', () => {
    expect(web(webHost({ ClipboardItem: undefined })).canCopy).toBe(false);
    TestBed.resetTestingModule();
    expect(web(webHost({ clipboard: undefined })).canCopy).toBe(false);
  });

  it('reports a tainted canvas (cross-origin image) plainly', async () => {
    const host = webHost({ toPng: vi.fn(async () => Promise.reject(new Error('tainted'))) });
    await expect(web(host).copy('https://elsewhere.example/a.jpg')).rejects.toThrow(
      'Couldn’t copy this image.',
    );
  });
});

describe('ImageActions in the native build (parity items 6 and 10)', () => {
  function native(media: Partial<NativeMediaTransport>): ImageActions {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_MEDIA, useValue: media }],
    });
    return TestBed.inject(ImageActions);
  }

  it('copies and saves through Rust, never through the renderer', async () => {
    const media = {
      copyImage: vi.fn().mockResolvedValue(undefined),
      saveImage: vi.fn().mockResolvedValue('alice_42_1.png'),
    };
    const actions = native(media);
    expect(actions.canCopy && actions.canSave).toBe(true);
    expect(await actions.copy('https://cdn.example/a.png')).toBe('Image copied.');
    expect(media.copyImage).toHaveBeenCalledWith('https://cdn.example/a.png');
    expect(await actions.save('https://cdn.example/a.png', 'alice_42_1', 'A cat')).toBe(
      'Saved alice_42_1.png.',
    );
    expect(media.saveImage).toHaveBeenCalledWith(
      'https://cdn.example/a.png',
      'alice_42_1',
      'A cat',
    );
  });

  it('treats a cancelled save dialog as no message, and a refusal as an error', async () => {
    const actions = native({
      saveImage: vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('policy')),
      copyImage: vi.fn().mockRejectedValue(new Error('policy')),
    });
    expect(await actions.save('https://cdn.example/a.png', 'x', null)).toBeNull();
    await expect(actions.save('https://cdn.example/a.png', 'x', null)).rejects.toThrow(
      'Couldn’t save this image.',
    );
    await expect(actions.copy('https://127.0.0.1/a.png')).rejects.toThrow(
      'Couldn’t copy this image.',
    );
  });
});

describe('imageFileName', () => {
  it('is {account}_{post id}_{n}, using the server id of anonymous reads', () => {
    const status = {
      id: 'anonymous-mastodon:origin.example:99',
      providerRef: { statusId: '99' },
      account: { acct: 'alice@origin.example' },
      reblog: null,
    } as unknown as Status;
    expect(imageFileName(status, 0)).toBe('alice@origin.example_99_1');
    expect(imageFileName(null, 2)).toBe('image_3');
  });
});
