import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import { classifyAccount } from './adult-classifier';
import { NativeEvidence } from './native-evidence';

const person = (id: string) => ({ id, acct: id, note: '', fields: [] }) as unknown as Account;
const post = (id: string, account: Account, spoiler: string) =>
  ({ id, account, spoiler_text: spoiler, content: '<p>x</p>', reblog: null }) as unknown as Status;

describe('NativeEvidence', () => {
  beforeEach(() => localStorage.clear());

  it('is absent on the web and returns nothing', async () => {
    const evidence = TestBed.inject(NativeEvidence);
    expect(evidence.available).toBe(false);
    expect((await evidence.postsFor([person('1')])).size).toBe(0);
  });

  it('reads cached posts for each person from the local archive, skipping the unknown', async () => {
    const alice = person('1');
    const accountPosts = vi.fn(async (_handle: string, id: string) =>
      id === '1'
        ? [
            { localId: 1, isRead: false, status: post('a', alice, 'lewd') },
            { localId: 2, isRead: false, status: post('b', alice, 'nsfw') },
          ]
        : id === '3'
          ? Promise.reject(new Error('locked'))
          : [],
    );
    TestBed.configureTestingModule({
      providers: [{ provide: NATIVE_PROFILES, useValue: { accountPosts } }],
    });
    const auth = TestBed.inject(Auth);
    auth.kind.set('mastodon');
    auth.token.set('native-mastodon:a');
    const evidence = TestBed.inject(NativeEvidence);
    expect(evidence.available).toBe(true);

    const found = await evidence.postsFor([alice, person('2'), person('3')]);
    expect([...found.keys()]).toEqual(['1']);
    expect(accountPosts).toHaveBeenCalledWith('native-mastodon:a', '1', 0);
    // Two cached adult posts decide what one loaded page could not.
    expect(classifyAccount(alice, found.get('1')).adult).toBe(true);
  });

  it('drops an answer that arrives after the session changed', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const accountPosts = vi.fn(async () => {
      await gate;
      return [{ localId: 1, isRead: false, status: post('a', person('1'), 'lewd') }];
    });
    TestBed.configureTestingModule({
      providers: [{ provide: NATIVE_PROFILES, useValue: { accountPosts } }],
    });
    const auth = TestBed.inject(Auth);
    auth.kind.set('mastodon');
    auth.token.set('native-mastodon:a');
    const pending = TestBed.inject(NativeEvidence).postsFor([person('1')]);
    auth.token.set('native-mastodon:b');
    release();
    expect((await pending).size).toBe(0);
  });
});
