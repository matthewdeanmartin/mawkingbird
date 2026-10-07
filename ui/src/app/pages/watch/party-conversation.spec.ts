import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { PartyConversation } from './party-conversation';
import { StatusCard } from '../../status-card/status-card';
import { Status } from '../../models';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Streaming, StreamEvent } from '../../streaming';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { StatusVisibility } from '../../status-visibility';

@Component({ selector: 'app-status-card', template: '{{status()?.id}}' })
class Card {
  readonly status = input<Status>();
  readonly filterContext = input('thread');
  readonly partyTagsEnabled = input(false);
  readonly partyTagAdded = output<string>();
  readonly changed = output<Status>();
  readonly deleted = output<Status>();
  readonly replied = output<Status>();
}
const post = (id: string): Status =>
  ({
    id,
    url: `https://social.test/posts/${id}`,
    created_at: `2026-10-07T12:00:0${id}Z`,
    edited_at: null,
    account: { id: 'author' },
    media_attachments: [],
    content: '',
    tags: [],
  }) as unknown as Status;

describe('Temporary party conversations', () => {
  let fixture: ComponentFixture<PartyConversation>;
  let feeds: Map<string, Subject<Status[]>>;
  let streams: Map<string, Subject<StreamEvent>>;
  let api: { tagTimeline: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    feeds = new Map();
    streams = new Map();
    api = {
      tagTimeline: vi.fn((tag: string) => {
        const feed = new Subject<Status[]>();
        feeds.set(tag, feed);
        return feed;
      }),
    };
    TestBed.configureTestingModule({
      imports: [PartyConversation],
      providers: [
        { provide: Api, useValue: api },
        { provide: Auth, useValue: { kind: signal('mastodon'), isAnonymous: false } },
        {
          provide: Streaming,
          useValue: {
            open: ({ tag }: { tag: string }) => {
              const stream = new Subject<StreamEvent>();
              streams.set(tag, stream);
              return stream;
            },
          },
        },
        { provide: AnonymousPublicApi, useValue: {} },
        { provide: AnonymousAccount, useValue: { server: signal('https://social.test') } },
        {
          provide: StatusVisibility,
          useValue: {
            rendersNothing: (status: Status) =>
              status.filtered?.some((filter) => filter.filter.filter_action === 'hide') ?? false,
          },
        },
      ],
    });
    TestBed.overrideComponent(PartyConversation, {
      remove: { imports: [StatusCard] },
      add: { imports: [Card] },
    });
    fixture = TestBed.createComponent(PartyConversation);
    fixture.componentRef.setInput('session', 'first');
    fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());
  function items(): { status: Status; context: string }[] {
    return (
      fixture.componentInstance as unknown as { mixed(): { status: Status; context: string }[] }
    ).mixed();
  }
  it('mixes tags with replies once, without making subscription writes', () => {
    fixture.componentRef.setInput('comments', [post('1')]);
    fixture.componentInstance.addTag('#Anime2000');
    fixture.componentInstance.addTag('anime2000');
    fixture.componentInstance.addTag('AIEpisode2000');
    feeds.get('Anime2000')!.next([post('1'), post('2')]);
    feeds.get('AIEpisode2000')!.next([post('2'), post('3')]);
    fixture.detectChanges();
    expect(api.tagTimeline).toHaveBeenCalledTimes(2);
    expect(items().map((item) => item.status.id)).toEqual(['1', '2', '3']);
    expect(items().map((item) => item.context)).toEqual(['thread', 'public', 'public']);
  });
  it('applies stream edits and deletes and keeps hide filters effective', () => {
    fixture.componentInstance.addTag('Anime2000');
    feeds.get('Anime2000')!.next([post('1')]);
    streams.get('Anime2000')!.next({
      event: 'status.update',
      payload: { ...post('1'), content: 'edited', edited_at: '2026-10-07T13:00:00Z' },
    });
    expect(items()[0].status.content).toBe('edited');
    streams.get('Anime2000')!.next({
      event: 'update',
      payload: { ...post('2'), filtered: [{ filter: { filter_action: 'hide' } }] },
    });
    expect(items()).toHaveLength(1);
    streams.get('Anime2000')!.next({ event: 'delete', payload: '1' });
    expect(items()).toHaveLength(0);
  });
  it('clears tags and cancels requests/streams when the watch session changes', () => {
    fixture.componentInstance.addTag('Anime2000');
    const feed = feeds.get('Anime2000')!;
    const stream = streams.get('Anime2000')!;
    expect(feed.observed).toBe(true);
    expect(stream.observed).toBe(true);
    fixture.componentRef.setInput('session', 'next');
    fixture.detectChanges();
    expect(feed.observed).toBe(false);
    expect(stream.observed).toBe(false);
    expect(items()).toHaveLength(0);
  });
  it('uses raw tag cursors through duplicate posts and never treats filtered matches as source exhaustion', () => {
    fixture.componentInstance.addTag('Anime2000');
    feeds.get('Anime2000')!.next(Array.from({ length: 20 }, () => post('1')));
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { more(): void }).more();
    expect(api.tagTimeline).toHaveBeenLastCalledWith('Anime2000', '1', 20);
  });
  it('stops older paging at the retained post limit instead of discarding every new page', () => {
    fixture.componentInstance.addTag('Anime2000');
    for (let page = 0; page < 10; page++) {
      feeds
        .get('Anime2000')!
        .next(Array.from({ length: 20 }, (_, index) => post(String(page * 20 + index + 1))));
      (fixture.componentInstance as unknown as { more(): void }).more();
    }
    expect(api.tagTimeline).toHaveBeenCalledTimes(10);
    expect(items()).toHaveLength(200);
  });
});
