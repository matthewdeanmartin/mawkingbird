import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDialogs } from '../../shell/app-dialogs';
import { WatchQueue } from './watch-queue';
import { RECENT_VIDEOS, WatchQueuePage } from './watch-queue-page';
import { HistoryEntry, PostHistory } from '../../publishing/post-history';

const seen = (
  n: number,
  video: HistoryEntry['video'] | undefined,
  extra: Partial<HistoryEntry> = {},
) =>
  ({
    key: `mastodon|https://a.example|${n}`,
    network: 'mastodon',
    server: 'https://a.example',
    id: String(n),
    url: null,
    author: `u${n}@a.example`,
    name: `User ${n}`,
    text: `Post ${n}`,
    seen: 1000 - n,
    ...(video ? { video } : {}),
    ...extra,
  }) as HistoryEntry;

describe('WatchQueuePage', () => {
  let fixture: ComponentFixture<WatchQueuePage>;
  let queue: WatchQueue;
  const confirm = vi.fn<(message: string) => Promise<boolean>>();
  const entries = signal<HistoryEntry[]>([]);

  beforeEach(() => {
    localStorage.clear();
    confirm.mockReset();
    entries.set([]);
    TestBed.configureTestingModule({
      imports: [WatchQueuePage],
      providers: [
        provideRouter([]),
        { provide: AppDialogs, useValue: { confirm } },
        { provide: PostHistory, useValue: { current: () => ({ entries }) } },
      ],
    });
    queue = TestBed.inject(WatchQueue);
  });

  function mount(): HTMLElement {
    fixture = TestBed.createComponent(WatchQueuePage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const titles = (host: HTMLElement) =>
    [...host.querySelectorAll('li strong')].map((el) => el.textContent?.trim());

  it('says how to fill an empty queue, briefly', () => {
    const text = mount().textContent!;
    expect(text).toContain('Nothing lined up');
    expect(text).toContain('Add a video from any post, or from what you just saw below.');
  });

  it('offers recently seen videos under the queue, newest first, skipping queued ones', () => {
    const youtube = (id: string, title = '') => ({ title, params: { youtube: id } });
    entries.set([
      seen(1, youtube('aaaaaaaaaaa', 'Lamps')),
      seen(2, undefined),
      seen(3, youtube('bbbbbbbbbbb')),
      seen(4, youtube('aaaaaaaaaaa', 'Lamps again')),
      seen(5, { title: 'Bad', params: { youtube: 'not an id' } }),
      seen(6, youtube('ccccccccccc', 'Queued already')),
    ]);
    queue.add({ title: 'Queued already', params: { youtube: 'ccccccccccc' } });
    const host = mount();
    const recent = host.querySelector('section.recent')!;
    expect(recent.querySelector('h2')!.textContent).toContain('Recently seen');
    const rows = () =>
      [...recent.querySelectorAll('li strong')].map((el) => el.textContent?.trim());
    // A video without a title falls back to the post's text.
    expect(rows()).toEqual(['Lamps', 'Post 3']);
    expect(recent.querySelector('li')!.textContent).toContain('by User 1');

    (recent.querySelector('li button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(queue.items().map((item) => item.title)).toEqual(['Queued already', 'Lamps']);
    // Added videos leave Recently seen; the queue itself is listed above it.
    expect(rows()).toEqual(['Post 3']);
    expect(
      host
        .querySelector('ol.queue')!
        .compareDocumentPosition(host.querySelector('section.recent')!),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('offers at most a handful of recent videos, and nothing when history is empty', () => {
    expect(mount().querySelector('section.recent')).toBeNull();
    fixture.destroy();
    entries.set(
      Array.from({ length: 10 }, (_, i) =>
        seen(i, { title: `V${i}`, params: { youtube: `video${String(i).padStart(6, '0')}` } }),
      ),
    );
    expect(mount().querySelectorAll('section.recent li')).toHaveLength(RECENT_VIDEOS);
  });

  it('lists videos in play order with Watch links and reorders them', () => {
    queue.add({ title: 'First', params: { youtube: 'aaaaaaaaaaa' } });
    queue.add({
      title: '',
      params: { post: '7', server: 'https://a.example', youtube: 'bbbbbbbbbbb' },
    });
    const host = mount();
    expect(titles(host)).toEqual(['First', 'Untitled video']);
    expect(host.querySelector('li a')!.getAttribute('href')).toBe('/watch?youtube=aaaaaaaaaaa');
    expect(host.querySelectorAll('li')[1].textContent).toContain('Fediverse post');

    const firstUp = host.querySelector('li button') as HTMLButtonElement;
    expect(firstUp.disabled).toBe(true);
    const secondUp = host.querySelectorAll('li')[1].querySelector('button') as HTMLButtonElement;
    secondUp.click();
    fixture.detectChanges();
    expect(titles(host)).toEqual(['Untitled video', 'First']);
  });

  it('clears only after confirmation', async () => {
    queue.add({ title: 'First', params: { youtube: 'aaaaaaaaaaa' } });
    const host = mount();
    const clear = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Clear queue'),
    )!;

    confirm.mockResolvedValue(false);
    clear.click();
    await fixture.whenStable();
    expect(queue.items()).toHaveLength(1);

    confirm.mockResolvedValue(true);
    clear.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenLastCalledWith(
      'Remove everything from your watch queue?',
      expect.anything(),
    );
    expect(queue.items()).toEqual([]);
  });
});
