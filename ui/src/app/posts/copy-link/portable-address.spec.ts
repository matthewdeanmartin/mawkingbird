import { Location } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Status } from '../../platform/api/models';
import { Server } from '../../platform/http/server';
import { keepPortableAddress } from './portable-address';

function post(id: string, provider?: Status['provider']): Status {
  return { id, provider, account: { acct: 'alice@far.example' } } as Status;
}

function watch(routeId: string, view: 'thread' | 'reader' | 'lite' = 'thread') {
  const replaceState = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: Location, useValue: { replaceState } },
      { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
    ],
  });
  const id = signal(routeId);
  const status = signal<Status | null>(null);
  TestBed.runInInjectionContext(() => keepPortableAddress(id, status, view));
  return { status, replaceState };
}

describe('keepPortableAddress', () => {
  it('swaps a server-local post id for the link Copy link would make', () => {
    const { status, replaceState } = watch('109');
    TestBed.tick();
    expect(replaceState).not.toHaveBeenCalled();

    status.set(post('109'));
    TestBed.tick();
    expect(replaceState).toHaveBeenCalledWith('/home.example/@alice@far.example/109', '');
  });

  it('marks a reader page so the link reopens the reader', () => {
    const { status, replaceState } = watch('109', 'reader');
    status.set(post('109'));
    TestBed.tick();
    expect(replaceState).toHaveBeenCalledWith('/home.example/@alice@far.example/109', 'read=1');
  });

  it('keeps a Lite page in Lite', () => {
    const { status, replaceState } = watch('109', 'lite');
    status.set(post('109'));
    TestBed.tick();
    expect(replaceState).toHaveBeenCalledWith('/m/home.example/@alice@far.example/109', '');
  });

  it('leaves already-portable ids and other networks alone', () => {
    const bluesky = watch('bsky:at://did:plc:a/app.bsky.feed.post/1');
    bluesky.status.set(post('bsky:at://did:plc:a/app.bsky.feed.post/1', 'bluesky'));
    TestBed.tick();
    expect(bluesky.replaceState).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const misskey = watch('9abc');
    misskey.status.set(post('9abc', 'misskey'));
    TestBed.tick();
    expect(misskey.replaceState).not.toHaveBeenCalled();
  });
});
