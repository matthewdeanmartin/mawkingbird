import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NATIVE_PROFILES } from '../platform/session/platform-login';
import { mergedFields, movedPost, proposedBio, savedHashtags, xBioLine } from './profile-plan';
import type { UnbirdArchive } from './unbird-archive';
import { UnbirdImportPoints } from './unbird-import-points';
import { UnbirdMatcher } from './unbird-matcher';
import { UnbirdStore } from './unbird-store';

function archive(extra: Partial<UnbirdArchive> = {}): UnbirdArchive {
  return {
    version: 1,
    id: 'a1',
    readAt: Date.UTC(2026, 10, 17),
    owner: { accountId: '1', userName: 'owner', displayName: 'Owner' },
    generatedAt: null,
    profile: { bio: 'Hi @friend, I write things', website: 'https://owner.example/', location: '' },
    counts: {},
    files: { total: 7, opened: [] },
    hasContacts: false,
    followingCount: 0,
    followerCount: 0,
    people: [],
    tweets: [],
    likes: [],
    savedSearches: ['#mastodon', 'from:someone', '#Café_Talk', '#mastodon'],
    ...extra,
  };
}

describe('profile plan', () => {
  it('defuses mentions in the bio like any replayed text', () => {
    expect(proposedBio(archive())).toBe('Hi friend, I write things');
  });

  it("adds Twitter and website links without duplicating or dropping the reader's own", () => {
    expect(mergedFields([{ name: 'Blog', value: 'https://owner.example' }], archive())).toEqual([
      { name: 'Blog', value: 'https://owner.example' },
      { name: 'Twitter', value: 'https://twitter.com/owner' },
    ]);
    const full = [1, 2, 3, 4].map((n) => ({ name: `F${n}`, value: `v${n}` }));
    expect(mergedFields(full, archive())).toEqual(full);
    expect(mergedFields(full, archive(), 6)).toHaveLength(6);
  });

  it('writes the moved post and the X bio line', () => {
    expect(movedPost(archive())).toContain('where I was owner.');
    expect(movedPost(archive())).not.toContain('@owner');
    expect(xBioLine('me@hachyderm.io', 'https://hachyderm.io/@me')).toBe(
      'Now on Mastodon: @me@hachyderm.io https://hachyderm.io/@me',
    );
  });

  it('turns hashtag saved searches into tags to follow, once each', () => {
    expect(savedHashtags(archive())).toEqual(['mastodon', 'Café_Talk']);
  });
});

describe('UnbirdImportPoints', () => {
  function render(native: boolean) {
    TestBed.configureTestingModule({
      providers: [
        { provide: NATIVE_PROFILES, useValue: native ? {} : null },
        {
          provide: UnbirdStore,
          useValue: {
            listArchives: async () => [
              { id: 'a1', userName: 'owner', readAt: 0, tweets: 3 },
              { id: 'a2', userName: 'alt', readAt: 0, tweets: 9 },
            ],
            loadArchive: async () => archive(),
            loadMatches: async () => [],
          },
        },
      ],
    });
    return TestBed.inject(UnbirdMatcher);
  }

  it('lists kept archives on Native, marking the one in use', async () => {
    const matcher = render(true);
    await matcher.restore();
    const fixture = TestBed.createComponent(UnbirdImportPoints);
    fixture.detectChanges();
    const items = [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('In use');
    expect(items[1].textContent).toContain('Use this one');
  });

  it('shows nothing on the web, which keeps one archive', async () => {
    const matcher = render(false);
    await matcher.restore();
    const fixture = TestBed.createComponent(UnbirdImportPoints);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('section')).toBeNull();
  });
});
