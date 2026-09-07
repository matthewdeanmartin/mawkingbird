import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from '../../providers/bluesky/bluesky-api';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { BlueskyPublication, blueskyThreadError } from './bluesky-publication';

describe('Write Bluesky publication', () => {
  let publisher: BlueskyPublication;
  const post = vi.fn();
  beforeEach(() => {
    post.mockReset();
    TestBed.configureTestingModule({
      providers: [
        BlueskyPublication,
        { provide: BlueskyApi, useValue: { post } },
        { provide: BlueskySession, useValue: { session: signal({ did: 'did:test' }) } },
      ],
    });
    publisher = TestBed.inject(BlueskyPublication);
  });
  it('preflights every segment before publishing any of them', async () => {
    await expect(publisher.publish(['one', 'x'.repeat(301), 'three', 'four'], [])).rejects.toThrow(
      'post 2 of 4',
    );
    expect(post).not.toHaveBeenCalled();
    expect(blueskyThreadError(['👨‍👩‍👧‍👦'.repeat(100)])).toBeNull();
  });
  it('resumes after the confirmed first post when the second is edited', async () => {
    post
      .mockReturnValueOnce(of({ uri: 'at://one', cid: 'one' }))
      .mockReturnValueOnce(throwError(() => new Error('rejected')));
    await expect(publisher.publish(['one', 'two', 'three', 'four'], [])).rejects.toThrow(
      '1 posts confirmed',
    );
    const failedKey = post.mock.calls[1][1].rkey;
    post.mockImplementation((record: { text: string }) =>
      of({ uri: `at://${record.text}`, cid: record.text }),
    );
    await publisher.publish(['one', 'shorter two', 'three', 'four'], []);
    expect(post.mock.calls.map(([record]) => record.text)).toEqual([
      'one',
      'two',
      'shorter two',
      'three',
      'four',
    ]);
    expect(post.mock.calls[2][1].rkey).toBe(failedKey);
    expect(post.mock.calls[2][0].reply).toEqual({
      root: { uri: 'at://one', cid: 'one' },
      parent: { uri: 'at://one', cid: 'one' },
    });
    expect(
      post.mock.calls.every(([record]) => !('langs' in record) && !('language' in record)),
    ).toBe(true);
  });
  it('refuses edits to confirmed posts instead of starting a duplicate thread', async () => {
    post
      .mockReturnValueOnce(of({ uri: 'at://one', cid: 'one' }))
      .mockReturnValueOnce(throwError(() => new Error('rejected')));
    await expect(publisher.publish(['one', 'two'], [])).rejects.toThrow();
    await expect(publisher.publish(['edited one', 'two'], [])).rejects.toThrow(
      'published posts unchanged',
    );
    expect(post).toHaveBeenCalledTimes(2);
  });
});
