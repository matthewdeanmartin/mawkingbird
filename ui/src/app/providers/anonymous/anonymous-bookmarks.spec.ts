import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { AnonymousBookmarks } from './anonymous-bookmarks';

const status = {
  id: 'one',
  url: 'https://social.example/@alice/one',
  bookmarked: false,
  account: { id: 'alice', username: 'alice' },
} as Status;

describe('AnonymousBookmarks', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('stores a complete snapshot and toggles it by canonical URL', () => {
    const bookmarks = TestBed.inject(AnonymousBookmarks);
    expect(bookmarks.toggle(status).bookmarked).toBe(true);
    expect(bookmarks.has({ ...status, id: 'instance-copy' })).toBe(true);
    expect(bookmarks.toggle({ ...status, id: 'instance-copy' }).bookmarked).toBe(false);
    expect(bookmarks.bookmarks()).toEqual([]);
  });
});
