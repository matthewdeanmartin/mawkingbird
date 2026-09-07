import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Announcement, AnnouncementReaction } from '../models';
import { Announcements } from './announcements';

interface AnnouncementsInternals {
  announcements: WritableSignal<Announcement[]>;
  quickReactions: string[];
}

function internals(fixture: ComponentFixture<Announcements>): AnnouncementsInternals {
  return fixture.componentInstance as unknown as AnnouncementsInternals;
}

function makeAnnouncement(id: string, reactions: AnnouncementReaction[] = []): Announcement {
  return {
    id,
    content: `<p>Announcement ${id}</p>`,
    starts_at: null,
    ends_at: null,
    all_day: false,
    published_at: null,
    updated_at: null,
    read: false,
    reactions,
  };
}

function makeReaction(name: string, count: number, me: boolean): AnnouncementReaction {
  return { name, count, me, url: null, static_url: null };
}

describe('Announcements', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(initialAnnouncements: Announcement[] = []): ComponentFixture<Announcements> {
    const fixture = TestBed.createComponent(Announcements);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush(initialAnnouncements);
    return fixture;
  }

  // ---------------------------------------------------------------- initial load

  it('fetches announcements on init', () => {
    const fixture = TestBed.createComponent(Announcements);
    fixture.detectChanges();
    const req = httpMock.expectOne('/api/v1/announcements');
    expect(req.request.method).toBe('GET');
    req.flush([makeAnnouncement('1')]);
    expect(internals(fixture).announcements()).toHaveLength(1);
  });

  it('exposes the four quick-reaction emojis', () => {
    const fixture = setUp();
    expect(internals(fixture).quickReactions).toEqual(['👍', '🎉', '❤️', '🚀']);
  });

  // ---------------------------------------------------------------- dismiss

  it('dismiss: removes the announcement optimistically and calls DELETE', () => {
    const a = makeAnnouncement('42');
    const fixture = setUp([a]);
    fixture.componentInstance.dismiss(a);

    // Optimistic removal happens immediately.
    expect(internals(fixture).announcements()).toHaveLength(0);

    // Then the HTTP call goes out.
    const req = httpMock.expectOne('/api/v1/announcements/42/dismiss');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('dismiss: only removes the targeted announcement when multiple exist', () => {
    const a1 = makeAnnouncement('1');
    const a2 = makeAnnouncement('2');
    const fixture = setUp([a1, a2]);
    fixture.componentInstance.dismiss(a1);

    expect(
      internals(fixture)
        .announcements()
        .map((x) => x.id),
    ).toEqual(['2']);
    httpMock.expectOne('/api/v1/announcements/1/dismiss').flush({});
  });

  // ---------------------------------------------------------------- toggleReaction — add

  it('toggleReaction: adds a new reaction when none exists for that emoji', () => {
    const a = makeAnnouncement('10', []);
    const fixture = setUp([a]);
    fixture.componentInstance.toggleReaction(a, '👍');

    httpMock.expectOne((r) => r.url.startsWith('/api/v1/announcements/10/reactions/')).flush({});

    const updated = internals(fixture).announcements()[0];
    const reaction = updated.reactions.find((r) => r.name === '👍');
    expect(reaction).toMatchObject({ count: 1, me: true });
  });

  it('toggleReaction: increments count when reaction exists but not from me', () => {
    const a = makeAnnouncement('10', [makeReaction('🎉', 3, false)]);
    const fixture = setUp([a]);
    fixture.componentInstance.toggleReaction(a, '🎉');

    httpMock.expectOne((r) => r.url.startsWith('/api/v1/announcements/10/reactions/')).flush({});

    const reaction = internals(fixture)
      .announcements()[0]
      .reactions.find((r) => r.name === '🎉');
    expect(reaction).toMatchObject({ count: 4, me: true });
  });

  // ---------------------------------------------------------------- toggleReaction — remove

  it('toggleReaction: decrements count when I already reacted', () => {
    const a = makeAnnouncement('10', [makeReaction('❤️', 2, true)]);
    const fixture = setUp([a]);
    fixture.componentInstance.toggleReaction(a, '❤️');

    // Should DELETE / remove the reaction.
    httpMock.expectOne((r) => r.url.startsWith('/api/v1/announcements/10/reactions/')).flush({});

    const reaction = internals(fixture)
      .announcements()[0]
      .reactions.find((r) => r.name === '❤️');
    expect(reaction).toMatchObject({ count: 1, me: false });
  });

  it('toggleReaction: removes the reaction entry when count drops to zero', () => {
    const a = makeAnnouncement('10', [makeReaction('🚀', 1, true)]);
    const fixture = setUp([a]);
    fixture.componentInstance.toggleReaction(a, '🚀');

    httpMock.expectOne((r) => r.url.startsWith('/api/v1/announcements/10/reactions/')).flush({});

    const reactions = internals(fixture).announcements()[0].reactions;
    expect(reactions.find((r) => r.name === '🚀')).toBeUndefined();
  });

  it('toggleReaction: does not mutate other announcements', () => {
    const a1 = makeAnnouncement('1', [makeReaction('👍', 0, false)]);
    const a2 = makeAnnouncement('2', [makeReaction('👍', 5, true)]);
    const fixture = setUp([a1, a2]);
    fixture.componentInstance.toggleReaction(a1, '👍');

    httpMock.expectOne((r) => r.url.startsWith('/api/v1/announcements/1/reactions/')).flush({});

    // a2 should be unchanged.
    const a2Updated = internals(fixture)
      .announcements()
      .find((x) => x.id === '2')!;
    expect(a2Updated.reactions[0]).toMatchObject({ count: 5, me: true });
  });
});
