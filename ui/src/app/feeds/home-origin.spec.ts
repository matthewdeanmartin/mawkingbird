import { describe, expect, it } from 'vitest';
import { Status } from '../platform/api/models';
import { passesHomeOrigin } from './home-origin';

function post(acct: string, extra: Partial<Status> = {}): Status {
  return { id: acct, account: { acct }, reblog: null, ...extra } as unknown as Status;
}

describe('passesHomeOrigin', () => {
  it('keeps everything for all', () => {
    expect(passesHomeOrigin(post('alice@remote.example'), 'all')).toBe(true);
    expect(passesHomeOrigin(post('bob'), 'all')).toBe(true);
  });

  it('splits bare local handles from remote ones', () => {
    expect(passesHomeOrigin(post('bob'), 'local')).toBe(true);
    expect(passesHomeOrigin(post('alice@remote.example'), 'local')).toBe(false);
    expect(passesHomeOrigin(post('alice@remote.example'), 'remote')).toBe(true);
    expect(passesHomeOrigin(post('bob'), 'remote')).toBe(false);
  });

  it("judges a boost by the boosted post's author", () => {
    const boost = post('bob', { reblog: post('alice@remote.example') });
    expect(passesHomeOrigin(boost, 'local')).toBe(false);
    expect(passesHomeOrigin(boost, 'remote')).toBe(true);
  });

  it('never counts another network as local', () => {
    const bsky = post('someone.bsky.social', { provider: 'bluesky' } as Partial<Status>);
    expect(passesHomeOrigin(bsky, 'local')).toBe(false);
    expect(passesHomeOrigin(bsky, 'remote')).toBe(true);
  });
});
