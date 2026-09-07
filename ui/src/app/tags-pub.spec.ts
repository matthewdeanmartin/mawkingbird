import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from './api';
import { Account, Relationship } from './models';
import { TagsPub } from './tags-pub';

function relay(id: string, acct: string): Account {
  return { id, acct, username: acct.split('@')[0] } as Account;
}

function rel(id: string, following: boolean): Relationship {
  return { id, following } as Relationship;
}

describe('TagsPub', () => {
  function setUp(api: Partial<Api>): TagsPub {
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    const tagsPub = TestBed.inject(TagsPub);
    tagsPub.delayMs = 0;
    return tagsPub;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('resolves each relay then reads every follow state in ONE batched call', async () => {
    const search = vi
      .fn()
      .mockReturnValueOnce(of({ accounts: [relay('1', 'cats@tags.pub')] }))
      .mockReturnValueOnce(of({ accounts: [relay('2', 'baking@tags.pub')] }));
    const relationships = vi.fn().mockReturnValue(of([rel('1', true), rel('2', false)]));
    const tagsPub = setUp({ search, relationships } as unknown as Api);

    await tagsPub.check(['cats', 'baking']);

    // Resolve cannot be batched (no bulk webfinger), but the follow-state read
    // is one request for the whole set — that is the point of doing it this way.
    expect(search).toHaveBeenCalledTimes(2);
    expect(relationships).toHaveBeenCalledTimes(1);
    expect(relationships).toHaveBeenCalledWith(['1', '2']);
    expect(tagsPub.rows().map((r) => r.status)).toEqual(['following', 'not_following']);
    expect(tagsPub.pending().map((r) => r.tag)).toEqual(['baking']);
  });

  it('marks a tag with no relay account as missing, not failed', async () => {
    const search = vi.fn().mockReturnValue(of({ accounts: [] }));
    const relationships = vi.fn();
    const tagsPub = setUp({ search, relationships } as unknown as Api);

    await tagsPub.check(['nobodyusesthis']);

    // Not every hashtag has a relay; that is an answer, not an error.
    expect(tagsPub.rows()[0].status).toBe('missing');
    expect(relationships).not.toHaveBeenCalled();
    expect(tagsPub.error()).toBeNull();
  });

  it('requires an exact acct match so a look-alike is never followed', async () => {
    const search = vi.fn().mockReturnValue(of({ accounts: [relay('9', 'cats@evil.example')] }));
    const tagsPub = setUp({ search, relationships: vi.fn() } as unknown as Api);

    await tagsPub.check(['cats']);

    expect(tagsPub.rows()[0].status).toBe('missing');
  });

  it('followAll() follows only the relays that are not followed yet', async () => {
    const search = vi
      .fn()
      .mockReturnValueOnce(of({ accounts: [relay('1', 'cats@tags.pub')] }))
      .mockReturnValueOnce(of({ accounts: [relay('2', 'baking@tags.pub')] }));
    const relationships = vi.fn().mockReturnValue(of([rel('1', true), rel('2', false)]));
    const follow = vi.fn().mockReturnValue(of(rel('2', true)));
    const tagsPub = setUp({ search, relationships, follow } as unknown as Api);

    await tagsPub.check(['cats', 'baking']);
    await tagsPub.followAll();

    expect(follow).toHaveBeenCalledTimes(1);
    expect(follow).toHaveBeenCalledWith('2');
    expect(tagsPub.rows().map((r) => r.status)).toEqual(['following', 'following']);
  });

  it('reports a failed check rather than leaving rows stuck on "checking"', async () => {
    const search = vi.fn().mockReturnValue(of({ accounts: [relay('1', 'cats@tags.pub')] }));
    const relationships = vi.fn().mockReturnValue(throwError(() => new Error('nope')));
    const tagsPub = setUp({ search, relationships } as unknown as Api);

    await tagsPub.check(['cats']);

    expect(tagsPub.error()).toContain('Could not check tags.pub');
    expect(tagsPub.checking()).toBe(false);
  });
});
