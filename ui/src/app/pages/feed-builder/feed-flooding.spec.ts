import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalModeration } from '../../local-moderation';
import { Account, Status } from '../../models';
import { VideoSubscriptions } from '../../providers/videos/video-subscriptions';
import { FeedBuilderEntry, feedBuilderPageAt } from './feed-builder-registry';
import { loadFeedPage } from './feed-builder-routes';
import { FLOOD_CHECK, checkTags, flooders, readTag } from './feed-flooding-check';
import { FeedFlooding, TEMPORARY_MUTE_SECONDS } from './feed-flooding';
import { YoutubeSubscribe, YoutubeSubscribeAll } from './youtube-subscribe';

const ENTRY = feedBuilderPageAt('it/fantascienza-su-mastodon') as FeedBuilderEntry;
const author = (name: string): Account =>
  ({
    id: name,
    username: name,
    acct: `${name}@x.social`,
    url: `https://x.social/@${name}`,
  }) as Account;
const posts = (spec: Record<string, number>): Status[] =>
  Object.entries(spec).flatMap(([name, n]) =>
    Array.from(
      { length: n },
      (_, i) =>
        ({
          id: `${name}-${i}`,
          uri: `https://x/${name}/${i}`,
          created_at: new Date(Date.UTC(2026, 10, 5) - i * 60_000).toISOString(),
          account: author(name),
          reblog: null,
        }) as unknown as Status,
    ),
  );

describe('flooding check', () => {
  it('flags an account at a quarter or more of a big enough sample, by Feed Doctor’s rule', () => {
    const flooding = readTag('SciFi', posts({ bot: 12, a: 10, b: 10, c: 8 })); // 30%
    const busyButFine = readTag('Fantasy', posts({ bot: 9, a: 10, b: 10, c: 11 })); // ≤ 27.5%, top is c
    const tooSmall = readTag('SFF', posts({ bot: 4, a: 1 })); // 80% of 5 posts
    const result = flooders([flooding, busyButFine, tooSmall]);
    expect(result.map((f) => f.account.acct)).toEqual(['bot@x.social', 'c@x.social']);
    expect(result[0].evidence).toEqual([{ tag: 'SciFi', count: 12, total: 40, share: 0.3 }]);
  });

  it('merges one account’s floods across hashtags', () => {
    const result = flooders([
      readTag('SciFi', posts({ bot: 21, a: 19 })),
      readTag('StarTrek', posts({ bot: 30, a: 10 })),
    ]);
    const bot = result.find((f) => f.account.acct === 'bot@x.social');
    expect(bot?.evidence.map((e) => e.tag)).toEqual(['SciFi', 'StarTrek']);
  });

  it('reads at most a fixed number of hashtags, 40 posts each, reporting progress', async () => {
    const asked: { tag: string; limit: number }[] = [];
    const progress: [number, number][] = [];
    const tags = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const readings = await checkTags({
      tags,
      read: async (tag, limit) => {
        asked.push({ tag, limit });
        if (tag === 't3') throw new Error('down');
        return posts({ a: 3 });
      },
      onProgress: (done, planned) => progress.push([done, planned]),
    });
    expect(asked.length).toBe(FLOOD_CHECK.tags);
    expect(asked.every((a) => a.limit === FLOOD_CHECK.postsPerTag)).toBe(true);
    expect(readings.length).toBe(FLOOD_CHECK.tags);
    expect(progress.at(-1)).toEqual([FLOOD_CHECK.tags, FLOOD_CHECK.tags]);
    const failed = readings.find((r) => r.tag === 't3');
    if (failed) expect(failed.total).toBe(0);
  });
});

function route(data: object, path: string) {
  return {
    provide: ActivatedRoute,
    useValue: {
      snapshot: {
        data,
        pathFromRoot: [{ routeConfig: null }, { routeConfig: { path } }],
        paramMap: convertToParamMap({}),
        queryParamMap: convertToParamMap({}),
      },
      paramMap: of(convertToParamMap({})),
      queryParamMap: of(convertToParamMap({})),
    },
  };
}

describe('Flooding tab', () => {
  // Browser-local mutes belong to the Anonymous account; a signed-in reader
  // mutes on their server (author-moderation.spec.ts).
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
  });
  afterEach(() => localStorage.clear());

  async function render() {
    const page = await loadFeedPage(ENTRY);
    TestBed.configureTestingModule({
      imports: [FeedFlooding],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        route({ page, lang: ENTRY.lang }, `${ENTRY.path}/flooding`),
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeedFlooding);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    // Every tag answers the same: one account is half of it.
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      const pending = http.match(() => true);
      if (!pending.length) break;
      for (const request of pending) {
        expect(request.request.url).toContain('/api/v1/timelines/tag/');
        expect(request.request.params.get('limit')).toBe(String(FLOOD_CHECK.postsPerTag));
        request.flush(posts({ spammer: 20, a: 10, b: 10 }));
      }
    }
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, page };
  }

  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(text),
    ) as HTMLButtonElement;

  it('names the flooder with evidence and offers exactly two mutes', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('@spammer@x.social');
    expect(el.textContent).toMatch(/50% di #\S+ \(20 post su 40\)/);
    const flooderRow = el.querySelector('#flooders-heading')?.parentElement as HTMLElement;
    const choices = [...flooderRow.querySelectorAll('.person-actions button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(choices).toEqual(['Silenzia per 8 ore', 'Silenzia per sempre']);
    const name = flooderRow.querySelector('a[target="_blank"]') as HTMLAnchorElement;
    expect(decodeURIComponent(name.getAttribute('href') ?? '')).toContain('@spammer@x.social');
    expect(name.getAttribute('rel')).toContain('noopener');
  });

  it('mutes for 8 hours, or for good, in Mawkingbird; Undo lifts it', async () => {
    const { fixture, el } = await render();
    const moderation = TestBed.inject(LocalModeration);
    const spammer = author('spammer');
    button(el, 'Silenzia per 8 ore').click();
    fixture.detectChanges();
    expect(moderation.isMuted(spammer)).toBe(true);
    const entry = moderation.list().find((e) => e.acct === 'spammer@x.social');
    expect(entry?.expiresAt).toBeGreaterThan(Date.now() + (TEMPORARY_MUTE_SECONDS - 60) * 1000);
    expect(entry?.expiresAt).toBeLessThan(Date.now() + (TEMPORARY_MUTE_SECONDS + 60) * 1000);
    expect(el.textContent).toContain('Silenziato per 8 ore');
    button(el, 'Annulla').click();
    fixture.detectChanges();
    expect(moderation.isMuted(spammer)).toBe(false);
    button(el, 'Silenzia per sempre').click();
    fixture.detectChanges();
    expect(moderation.isMuted(spammer)).toBe(true);
    const forever = moderation.list().find((e) => e.acct === 'spammer@x.social');
    expect(forever?.expiresAt).toBeGreaterThan(Date.now() + 365 * 24 * 60 * 60 * 1000);
  });
});

describe('YouTube subscribe', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());
  const words = {
    subscribe: 'Subscribe in Mawkingbird',
    subscribed: 'Subscribed',
    subscribeAll: (n: number) => `Subscribe to all ${n} YouTube channels`,
    watch: 'Watch them in Mawkingbird',
  };
  const channels = [
    { id: 'UC' + 'a'.repeat(22), title: 'Extra Trek' },
    { id: 'UC' + 'b'.repeat(22), title: 'Writer' },
  ];

  it('subscribes and unsubscribes one channel in video mode', async () => {
    TestBed.configureTestingModule({ imports: [YoutubeSubscribe] });
    const fixture = TestBed.createComponent(YoutubeSubscribe);
    fixture.componentRef.setInput('channel', channels[0]);
    fixture.componentRef.setInput('words', words);
    fixture.detectChanges();
    const subscriptions = TestBed.inject(VideoSubscriptions);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(subscriptions.has(channels[0].id)).toBe(true);
    expect(el.textContent).toContain('Subscribed');
    (el.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(subscriptions.has(channels[0].id)).toBe(false);
  });

  it('subscribes to every channel on the shelf, then links to video mode', async () => {
    TestBed.configureTestingModule({
      imports: [YoutubeSubscribeAll],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(YoutubeSubscribeAll);
    fixture.componentRef.setInput('channels', channels);
    fixture.componentRef.setInput('words', words);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[href="/videos"]')).toBeNull();
    (el.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const subscriptions = TestBed.inject(VideoSubscriptions);
    expect(channels.every((c) => subscriptions.has(c.id))).toBe(true);
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('a[href="/videos"]')).not.toBeNull();
  });
});
