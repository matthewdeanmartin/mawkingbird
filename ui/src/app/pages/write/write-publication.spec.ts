import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { DraftSnapshot } from '../../drafts';
import { Status } from '../../models';
import { PasteProviderRegistry } from '../../providers/paste/paste-provider-registry';
import { PasteHistory } from '../../providers/paste/paste-history';
import { MataroaApi } from '../../providers/mataroa/mataroa-api';
import { BloggerApi } from '../../providers/blogger/blogger-api';
import { BloggerSession } from '../../providers/blogger/blogger-session';
import { HugoPublish } from '../../providers/hugo/hugo-publish';
import { HugoDeployWatch } from '../../providers/hugo/hugo-deploy-watch';
import { BlueskyPublication } from './bluesky-publication';
import { WritePublication } from './write-publication';

describe('Write publication', () => {
  let publisher: WritePublication;
  const postStatus = vi.fn();
  const bsky = vi.fn();
  const account = signal({ id: 'me' });
  const draft = (segments = ['one', 'two']): DraftSnapshot => ({
    segments,
    target: 'fedi',
    spoilerText: 'CW',
    sensitive: false,
    visibility: 'private',
    postLanguage: 'en',
    poll: null,
  });
  beforeEach(() => {
    postStatus.mockReset();
    bsky.mockReset();
    account.set({ id: 'me' });
    TestBed.configureTestingModule({
      providers: [
        WritePublication,
        { provide: Api, useValue: { postStatus } },
        { provide: Auth, useValue: { account } },
        { provide: Server, useValue: { baseUrl: signal('https://example.test') } },
        { provide: BlueskyPublication, useValue: { publish: bsky } },
        ...[
          PasteProviderRegistry,
          PasteHistory,
          MataroaApi,
          BloggerApi,
          BloggerSession,
          HugoPublish,
          HugoDeployWatch,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    });
    publisher = TestBed.inject(WritePublication);
  });
  it('waits for each post, links replies and retains visibility, language and CW', async () => {
    const first = new Subject<Status>();
    postStatus.mockReturnValueOnce(first).mockReturnValueOnce(of({ id: 'two' }));
    const sending = publisher.publish(draft(), [], '');
    expect(postStatus).toHaveBeenCalledTimes(1);
    expect(publisher.progress()).toContain('1 of 2');
    first.next({ id: 'one' } as Status);
    await sending;
    expect(postStatus.mock.calls[1][1]).toEqual({
      inReplyToId: 'one',
      visibility: 'private',
      language: 'en',
      spoilerText: 'CW',
    });
  });
  it('retries only unfinished posts with the same idempotency key', async () => {
    postStatus
      .mockReturnValueOnce(of({ id: 'one' }))
      .mockReturnValueOnce(throwError(() => new Error('too long')));
    await expect(publisher.publish(draft(), [], '')).rejects.toThrow(
      '1 of 2 Mastodon posts confirmed',
    );
    const key = postStatus.mock.calls[1][2];
    postStatus.mockReturnValueOnce(of({ id: 'two' }));
    await publisher.publish(draft(['one', 'shorter']), [], '');
    expect(postStatus.mock.calls.map(([text]) => text)).toEqual(['one', 'two', 'shorter']);
    expect(postStatus.mock.calls[2][2]).toBe(key);
  });
  it('refuses changing the already published prefix', async () => {
    postStatus
      .mockReturnValueOnce(of({ id: 'one' }))
      .mockReturnValueOnce(throwError(() => new Error('failed')));
    await expect(publisher.publish(draft(), [], '')).rejects.toThrow();
    await expect(publisher.publish(draft(['different', 'two']), [], '')).rejects.toThrow(
      'confirmed posts unchanged',
    );
    expect(postStatus).toHaveBeenCalledTimes(2);
  });
  it('does not repeat Mastodon when the Bluesky leg needs retrying', async () => {
    postStatus.mockReturnValue(of({ id: 'one' }));
    bsky.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const both = { ...draft(['one']), target: 'both' as const };
    await expect(publisher.publish(both, [], '')).rejects.toThrow('offline');
    await publisher.publish(both, [], '');
    expect(postStatus).toHaveBeenCalledTimes(1);
    expect(bsky).toHaveBeenCalledTimes(2);
  });
  it('stops the next request if the account changes during a slow post', async () => {
    const first = new Subject<Status>();
    postStatus.mockReturnValue(first);
    const sending = publisher.publish(draft(), [], '');
    account.set({ id: 'other' });
    first.next({ id: 'one' } as Status);
    await expect(sending).rejects.toThrow('changed accounts');
    expect(postStatus).toHaveBeenCalledTimes(1);
  });
});
