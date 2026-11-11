import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { PartyConversation } from './party-conversation';
import { WatchPartyPrefs } from '../videos/watch-party-prefs';
import { StatusCard } from '../../posts/status-card/status-card';
import { Status } from '../../platform/api/models';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { Streaming, StreamEvent } from '../../platform/api/streaming';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { AnonymousAccount } from '../../accounts/anonymous/anonymous-account';
import { StatusVisibility } from '../../moderation/status-visibility';

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
  let api: { tagTimeline: ReturnType<typeof vi.fn>; postStatus: ReturnType<typeof vi.fn> };
  let posted: Subject<Status>;
  beforeEach(() => {
    localStorage.clear();
    posted = new Subject<Status>();
    feeds = new Map();
    streams = new Map();
    api = {
      tagTimeline: vi.fn((tag: string) => {
        const feed = new Subject<Status[]>();
        feeds.set(tag, feed);
        return feed;
      }),
      postStatus: vi.fn(() => posted),
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
            activeFilters: (status: Status) => status.filtered ?? [],
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
  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });
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
  it('joins the party tags as each session starts, skipping invalid ones', () => {
    // A party opened from the finder: /watch?…&tags=Debate,Live
    fixture.componentRef.setInput('initialTags', ['Debate', 'not-a-tag', 'Live']);
    fixture.componentRef.setInput('session', 'party');
    fixture.detectChanges();
    expect([...feeds.keys()]).toEqual(['Debate', 'Live']);
    // Tags the reader did not type are skipped quietly, not reported as invalid.
    const state = fixture.componentInstance as unknown as { validation(): boolean };
    expect(state.validation()).toBe(false);

    // A new session clears them and joins its own.
    fixture.componentRef.setInput('initialTags', ['Other']);
    fixture.componentRef.setInput('session', 'next');
    fixture.detectChanges();
    expect(feeds.get('Debate')!.observed).toBe(false);
    expect(feeds.get('Other')!.observed).toBe(true);
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

  describe('chat room controls', () => {
    const descriptors = ['showModal', 'close'].map(
      (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
    );
    beforeAll(() => {
      for (const [name] of descriptors)
        Object.defineProperty(HTMLDialogElement.prototype, name, {
          configurable: true,
          value(this: HTMLDialogElement) {
            this.open = name === 'showModal';
          },
        });
    });
    afterAll(() => {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
        else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
      }
    });
    const root = { ...post('9'), id: 'root' } as Status;
    const state = () =>
      fixture.componentInstance as unknown as {
        prefs: WatchPartyPrefs;
        setMode(mode: string): void;
        setRefresh(refresh: string): void;
        tagDialog(): boolean;
        cancelTagDialog(): void;
        joinFromDialog(): void;
        draft: { set(value: string): void };
        chat: { set(value: string): void };
        send(): void;
        lines(): { text: string; cw: string; media: boolean; nick: string }[];
        activeChatters(): number;
      };
    beforeEach(() => {
      fixture.componentRef.setInput('root', root);
      fixture.detectChanges();
    });

    it('opens as a compact chat of replies and hashtag together, updating live', () => {
      expect(state().prefs.view()).toBe('compact');
      expect(state().prefs.mode()).toBe('both');
      expect(state().prefs.refresh()).toBe('stream');
      expect(fixture.nativeElement.getAttribute('data-view')).toBe('compact');
    });

    it('shows only replies, only the hashtag, or both', () => {
      fixture.componentRef.setInput('comments', [post('1')]);
      fixture.componentInstance.addTag('Show');
      feeds.get('Show')!.next([post('2')]);
      fixture.detectChanges();
      expect(items().map((item) => item.status.id)).toEqual(['1', '2']);
      state().setMode('replies');
      expect(items().map((item) => item.status.id)).toEqual(['1']);
      state().setMode('hashtag');
      expect(items().map((item) => item.status.id)).toEqual(['2']);
    });

    it('asks for the show hashtag in a dialog, and backs out of Hashtag mode on cancel', () => {
      state().setMode('hashtag');
      fixture.detectChanges();
      expect(state().tagDialog()).toBe(true);
      expect(document.querySelector('dialog')).not.toBeNull();
      state().cancelTagDialog();
      expect(state().prefs.mode()).toBe('both');

      state().setMode('hashtag');
      state().draft.set('#Show');
      state().joinFromDialog();
      expect(state().tagDialog()).toBe(false);
      expect(state().prefs.mode()).toBe('hashtag');
      expect(feeds.has('Show')).toBe(true);
    });

    it('shows the hashtag too when one is joined while only replies are shown', () => {
      state().setMode('replies');
      state().draft.set('#Show');
      state().joinFromDialog();
      expect(state().prefs.mode()).toBe('both');
    });

    it('opens hashtag streams only in Live and closes them for polling or manual', () => {
      state().setRefresh('manual');
      fixture.detectChanges();
      fixture.componentInstance.addTag('Show');
      expect(streams.has('Show')).toBe(false);
      state().setRefresh('stream');
      fixture.detectChanges();
      expect(streams.get('Show')!.observed).toBe(true);
      state().setRefresh('poll60');
      fixture.detectChanges();
      expect(streams.get('Show')!.observed).toBe(false);
    });

    it('polls replies and hashtags at the chosen interval, and never in manual', () => {
      vi.useFakeTimers();
      const due = vi.fn();
      fixture.componentInstance.repliesDue.subscribe(due);
      state().setRefresh('poll5');
      fixture.detectChanges();
      fixture.componentInstance.addTag('Show');
      feeds.get('Show')!.next([]);
      api.tagTimeline.mockClear();
      vi.advanceTimersByTime(5000);
      expect(due).toHaveBeenCalledTimes(1);
      expect(api.tagTimeline).toHaveBeenCalledTimes(1);

      state().setRefresh('manual');
      fixture.detectChanges();
      vi.advanceTimersByTime(120000);
      expect(due).toHaveBeenCalledTimes(1);
    });

    it('posts chat publicly with the show hashtag, and as a reply when replies are shown', () => {
      fixture.componentRef.setInput('canReply', true);
      fixture.componentInstance.addTag('Show');
      fixture.detectChanges();
      const replied = vi.fn();
      fixture.componentInstance.replied.subscribe(replied);
      state().chat.set('here we go');
      state().send();
      expect(api.postStatus).toHaveBeenCalledWith(
        'here we go #Show',
        { inReplyToId: 'root', visibility: 'public' },
        expect.any(String),
      );
      posted.next(post('5'));
      expect(replied).toHaveBeenCalledWith(post('5'));

      state().setMode('hashtag');
      state().chat.set('already #show tagged');
      state().send();
      expect(api.postStatus).toHaveBeenLastCalledWith(
        'already #show tagged',
        { visibility: 'public' },
        expect.any(String),
      );
    });

    it('keeps content warnings closed and marks media on compact lines', () => {
      fixture.componentRef.setInput('comments', [
        {
          ...post('1'),
          account: { id: 'a', username: 'kat', acct: 'kat' },
          content: '<p>the twist</p>',
          spoiler_text: 'finale',
        },
        {
          ...post('2'),
          account: { id: 'b', username: 'bo', acct: 'bo@else.test' },
          content: '<p>look</p>',
          media_attachments: [{ id: 'm' }],
        },
      ]);
      fixture.detectChanges();
      const lines = [...fixture.nativeElement.querySelectorAll('.line-text')].map(
        (line: Element) => line.textContent ?? '',
      );
      expect(lines[0]).toContain('<kat>');
      expect(lines[0]).not.toContain('twist');
      expect(state().lines()[0].cw).toBe('finale');
      expect(lines[1]).toContain('<bo>');
      expect(lines[1]).toContain('📷');
      expect(lines[1]).toContain('look');
      expect(state().lines()[1].nick).toBe('bo');
    });

    it('counts people who posted in the last ten minutes as chatting', () => {
      const recent = new Date().toISOString();
      fixture.componentRef.setInput('comments', [
        { ...post('1'), created_at: recent, account: { id: 'a', acct: 'kat' } },
        { ...post('2'), created_at: recent, account: { id: 'a', acct: 'kat' } },
        { ...post('3'), account: { id: 'b', acct: 'old' } },
      ]);
      fixture.detectChanges();
      expect(state().activeChatters()).toBe(1);
    });
  });
});
