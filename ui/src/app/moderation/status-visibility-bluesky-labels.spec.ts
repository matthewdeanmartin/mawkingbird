import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StatusVisibility } from './status-visibility';
import { BlueskyModerationState } from '../connections/bluesky/bluesky-moderation-state';
import { adaptPost } from '../connections/bluesky/bluesky-adapter';
import { labelPrefKey } from '../connections/bluesky/bluesky-labels';
import { BskyPostView } from '../connections/bluesky/bluesky-types';

const MOD = 'did:plc:ar7c4by46qjdydhdevvrndac';

function post(labels: BskyPostView['labels'], author = 'did:plc:alice'): BskyPostView {
  return {
    uri: `at://${author}/app.bsky.feed.post/1`,
    cid: 'c',
    author: { did: author, handle: 'alice.test' },
    record: { $type: 'app.bsky.feed.post', text: 'hi', createdAt: '2026-11-20T00:00:00Z' },
    indexedAt: '2026-11-20T00:00:00Z',
    labels,
  };
}

describe('StatusVisibility: Bluesky labels', () => {
  it('leaves a hidden post out of lists but shows it behind a warning in a thread', () => {
    const visibility = TestBed.inject(StatusVisibility);
    const status = adaptPost(post([{ val: '!hide', src: MOD }]));
    expect(visibility.rendersNothing(status, 'home')).toBe(true);
    expect(visibility.rendersNothing(status, 'thread')).toBe(false);
    expect(visibility.activeFilters(status, 'thread').map((r) => r.filter.filter_action)).toEqual([
      'warn',
    ]);
  });

  it('never hides the reader’s own posts', () => {
    TestBed.inject(BlueskyModerationState).viewerDid.set('did:plc:alice');
    const status = adaptPost(post([{ val: '!hide', src: MOD }]));
    expect(TestBed.inject(StatusVisibility).rendersNothing(status, 'home')).toBe(false);
  });

  it('blurs media by the reader’s label setting, not only the label', () => {
    const state = TestBed.inject(BlueskyModerationState);
    const visibility = TestBed.inject(StatusVisibility);
    state.adultContent.set(true);
    const status = adaptPost(post([{ val: 'sexual', src: MOD }]));
    expect(visibility.mediaSensitive(status)).toBe(true);
    state.labelPrefs.set(new Map([[labelPrefKey('sexual'), 'ignore']]));
    expect(visibility.mediaSensitive(status)).toBe(false);
  });

  it('keeps the sensitive flag for other networks', () => {
    const visibility = TestBed.inject(StatusVisibility);
    const status = { ...adaptPost(post(undefined)), provider: 'mastodon', sensitive: true };
    expect(visibility.mediaSensitive(status as never)).toBe(true);
  });
});
