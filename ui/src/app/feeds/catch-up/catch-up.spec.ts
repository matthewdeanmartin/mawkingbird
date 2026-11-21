import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { scopedKey } from '../../platform/session/account-scope';
import { FeedAggregator } from '../feed-aggregator';
import { CATCH_UP_KEY_BASE, CatchUp } from './catch-up';

function post(id: string, author: string, minutesAgo: number): Status {
  return {
    id,
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    content: `<p>post ${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    account: {
      id: author,
      username: author,
      acct: author,
      display_name: author,
      avatar: '',
      emojis: [],
    },
    reblog: null,
    in_reply_to_id: null,
    media_attachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
  } as unknown as Status;
}

class FakeAggregator {
  cutoff: number | undefined;
  pages: Status[][] = [];
  reset(cutoff?: number): void {
    this.cutoff = cutoff;
  }
  hasMore(): boolean {
    return this.pages.length > 0;
  }
  nextPage() {
    return of(this.pages.shift() ?? []);
  }
}

describe('CatchUp', () => {
  let fake: FakeAggregator;

  beforeEach(() => {
    localStorage.clear();
    fake = new FakeAggregator();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.overrideComponent(CatchUp, {
      set: { providers: [{ provide: FeedAggregator, useValue: fake }] },
    });
    TestBed.inject(Auth).setToken('reader');
  });

  it('loads a bounded session grouped by person, then finishing records it', async () => {
    fake.pages = [[post('1', 'ann', 30), post('2', 'bob', 20)], [post('3', 'ann', 10)]];
    const fixture = TestBed.createComponent(CatchUp);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    await fixture.componentInstance.begin();
    fixture.detectChanges();

    // First session: 12 hours back.
    expect(Date.now() - fake.cutoff!).toBeGreaterThan(11.9 * 3_600_000);
    const people = [...el.querySelectorAll('.person-row .name')].map((n) => n.textContent?.trim());
    expect(people).toEqual(['ann', 'bob']);
    expect(el.querySelector('.ending')).not.toBeNull();

    fixture.componentInstance.finish();
    fixture.detectChanges();
    const stored = JSON.parse(localStorage.getItem(scopedKey(CATCH_UP_KEY_BASE)) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ posts: 3, people: 2 });
    expect(el.textContent).toContain('Caught up');
  });

  it('the next "since last time" starts where the previous one ended', async () => {
    const lastEnd = Date.now() - 2 * 3_600_000;
    localStorage.setItem(
      scopedKey(CATCH_UP_KEY_BASE),
      JSON.stringify([{ from: lastEnd - 3_600_000, to: lastEnd, posts: 1, people: 1 }]),
    );
    const fixture = TestBed.createComponent(CatchUp);
    fixture.detectChanges();
    await fixture.componentInstance.begin();
    expect(fake.cutoff).toBe(lastEnd);
  });

  it('expanding a person shows their posts', async () => {
    fake.pages = [[post('1', 'ann', 5)]];
    const fixture = TestBed.createComponent(CatchUp);
    fixture.detectChanges();
    await fixture.componentInstance.begin();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-status-card')).toBeNull();
    el.querySelector<HTMLButtonElement>('.person-row')!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-status-card')).not.toBeNull();
  });

  it('signed out, it explains instead of loading', () => {
    TestBed.inject(Auth).enterAnonymous('https://social.example');
    const fixture = TestBed.createComponent(CatchUp);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('needs a signed-in');
  });
});
