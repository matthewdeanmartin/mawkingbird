import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstanceInfo, Status, Tag as TagEntity } from '../../models';
import { Explore } from './explore';

type ExploreTab = 'posts' | 'hashtags';

interface ExploreInternals {
  tab: WritableSignal<ExploreTab>;
  instance: WritableSignal<InstanceInfo | null>;
  posts: WritableSignal<Status[]>;
  tags: WritableSignal<TagEntity[]>;
  loadingPosts: WritableSignal<boolean>;
  loadingTags: WritableSignal<boolean>;
  selectTab(tab: ExploreTab): void;
  tagUses(tag: TagEntity): number;
}

function internals(fixture: ComponentFixture<Explore>): ExploreInternals {
  return fixture.componentInstance as unknown as ExploreInternals;
}

function makeInstanceInfo(): InstanceInfo {
  return {
    domain: 'mastodon.example',
    title: 'Test Instance',
    description: 'A test instance',
    version: '4.3.0',
    usage: { users: { active_month: 100 } },
    thumbnail: { url: null },
    contact: { email: 'admin@example.com', account: null },
    rules: [],
  };
}

function makeStatus(id: string): Status {
  return {
    id,
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content: `<p>Trending ${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: '1', username: 'user', acct: 'user', display_name: 'User' } as never,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
  };
}

function makeTag(name: string, historyUses: string[] = []): TagEntity {
  return {
    id: name,
    name,
    url: `https://example.com/tags/${name}`,
    following: false,
    featuring: false,
    history: historyUses.map((uses, i) => ({ day: String(i), uses, accounts: '1' })),
  };
}

describe('Explore', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(): ComponentFixture<Explore> {
    const fixture = TestBed.createComponent(Explore);
    fixture.detectChanges();
    httpMock.expectOne('/api/v2/instance').flush(makeInstanceInfo());
    httpMock.expectOne('/api/v1/trends/statuses').flush([makeStatus('1')]);
    httpMock.expectOne('/api/v1/trends/tags').flush([makeTag('cats', ['10', '20'])]);
    return fixture;
  }

  // ---------------------------------------------------------------- initial load

  it('fetches instance info, trending posts, and tags on init', () => {
    const fixture = TestBed.createComponent(Explore);
    fixture.detectChanges();

    httpMock.expectOne('/api/v2/instance').flush(makeInstanceInfo());
    httpMock.expectOne('/api/v1/trends/statuses').flush([makeStatus('1'), makeStatus('2')]);
    httpMock.expectOne('/api/v1/trends/tags').flush([makeTag('cats')]);

    expect(internals(fixture).instance()?.domain).toBe('mastodon.example');
    expect(internals(fixture).posts()).toHaveLength(2);
    expect(internals(fixture).tags()).toHaveLength(1);
    expect(internals(fixture).loadingPosts()).toBe(false);
    expect(internals(fixture).loadingTags()).toBe(false);
  });

  it('clears loadingPosts on HTTP error for trending statuses', () => {
    const fixture = TestBed.createComponent(Explore);
    fixture.detectChanges();

    httpMock.expectOne('/api/v2/instance').flush(makeInstanceInfo());
    httpMock
      .expectOne('/api/v1/trends/statuses')
      .flush('', { status: 503, statusText: 'Unavailable' });
    httpMock.expectOne('/api/v1/trends/tags').flush([]);

    expect(internals(fixture).loadingPosts()).toBe(false);
  });

  it('clears loadingTags on HTTP error for trending tags', () => {
    const fixture = TestBed.createComponent(Explore);
    fixture.detectChanges();

    httpMock.expectOne('/api/v2/instance').flush(makeInstanceInfo());
    httpMock.expectOne('/api/v1/trends/statuses').flush([]);
    httpMock.expectOne('/api/v1/trends/tags').flush('', { status: 503, statusText: 'Unavailable' });

    expect(internals(fixture).loadingTags()).toBe(false);
  });

  it('sets instance to null on HTTP error', () => {
    const fixture = TestBed.createComponent(Explore);
    fixture.detectChanges();

    httpMock.expectOne('/api/v2/instance').flush('', { status: 500, statusText: 'Error' });
    httpMock.expectOne('/api/v1/trends/statuses').flush([]);
    httpMock.expectOne('/api/v1/trends/tags').flush([]);

    expect(internals(fixture).instance()).toBeNull();
  });

  // ---------------------------------------------------------------- selectTab

  it('defaults to the "posts" tab', () => {
    const fixture = setUp();
    expect(internals(fixture).tab()).toBe('posts');
  });

  it('selectTab switches the active tab', () => {
    const fixture = setUp();
    internals(fixture).selectTab('hashtags');
    expect(internals(fixture).tab()).toBe('hashtags');
  });

  // ---------------------------------------------------------------- tagUses

  it('tagUses: sums all history use counts', () => {
    const fixture = setUp();
    const tag = makeTag('cats', ['10', '20', '5']);
    expect(internals(fixture).tagUses(tag)).toBe(35);
  });

  it('tagUses: returns 0 for a tag with no history', () => {
    const fixture = setUp();
    expect(internals(fixture).tagUses(makeTag('empty'))).toBe(0);
  });

  it('tagUses: handles zero-use history entries', () => {
    const fixture = setUp();
    expect(internals(fixture).tagUses(makeTag('sparse', ['0', '0', '3']))).toBe(3);
  });
});
