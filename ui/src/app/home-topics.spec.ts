import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import { HomeTopics } from './home-topics';
import { Api } from './api';
import { Auth } from './auth';

describe('Home followed topics', () => {
  it('reads every metadata page without running a post search', async () => {
    const followedTagsPage = vi
      .fn()
      .mockReturnValueOnce(of({ tags: [{ name: 'cats' }], nextMaxId: 'next' }))
      .mockReturnValueOnce(of({ tags: [{ name: 'scifi' }, { name: 'cats' }], nextMaxId: null }));
    const search = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { followedTagsPage, search } },
        { provide: Auth, useValue: { isAnonymous: false, isBlueskyPrimary: false } },
      ],
    });
    expect(await TestBed.inject(HomeTopics).followed()).toEqual(['cats', 'scifi']);
    expect(followedTagsPage).toHaveBeenLastCalledWith('next');
    expect(search).not.toHaveBeenCalled();
  });
  it('rejects a repeated cursor rather than requesting metadata indefinitely', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { followedTagsPage: () => of({ tags: [], nextMaxId: 'same' }) } },
        { provide: Auth, useValue: { isAnonymous: false, isBlueskyPrimary: false } },
      ],
    });
    await expect(TestBed.inject(HomeTopics).followed()).rejects.toThrow(
      'Repeated followed-tag cursor',
    );
  });
});
