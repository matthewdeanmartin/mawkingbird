import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../platform/api/models';
import { Auth } from '../platform/session/auth';
import { NATIVE_PROFILES } from '../platform/session/platform-login';
import { BlogRollPage } from './blog-roll-page';

const me = { id: '1', acct: 'me', username: 'me', url: 'https://home.example/@me' } as Account;
const ann = {
  id: '2',
  acct: 'ann@far.example',
  username: 'ann',
  display_name: 'Ann',
  url: 'https://far.example/@ann',
} as Account;
const bob = { id: '3', acct: 'bob', username: 'bob', url: 'https://home.example/@bob' } as Account;

let minute = 0;
function post(id: string, by: Account, content: string, replyTo: string | null = null): Status {
  minute++;
  return {
    id,
    url: `${by.url}/${id}`,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
    content,
    visibility: 'public',
    account: by,
    in_reply_to_id: replyTo,
    in_reply_to_account_id: replyTo ? by.id : null,
    reblog: null,
  } as unknown as Status;
}
const wrap = (statuses: Status[]) =>
  statuses.map((status, i) => ({ localId: i, status, isRead: false }));

describe('BlogRollPage', () => {
  const peoplePosts = vi.fn();
  let token: string | null;
  let native: object | null;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    token = 'native-mastodon:x';
    native = { peoplePosts };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: NATIVE_PROFILES, useFactory: () => native },
        { provide: Auth, useValue: { token: () => token, account: signal(me) } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(BlogRollPage);
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    return fixture.nativeElement as HTMLElement;
  }

  it('explains itself on the web', async () => {
    native = null;
    const el = await render();
    expect(el.textContent).toContain('Roll needs the desktop app');
    expect(peoplePosts).not.toHaveBeenCalled();
  });

  it("lists followed people's storms and long posts, never your own", async () => {
    const storm = [
      post('10', ann, '<p>Ann storm</p>'),
      post('11', ann, '<p>b</p>', '10'),
      post('12', ann, '<p>c</p>', '11'),
    ];
    const mine = [
      post('20', me, '<p>My storm</p>'),
      post('21', me, '<p>b</p>', '20'),
      post('22', me, '<p>c</p>', '21'),
    ];
    const long = post('30', bob, `<p>Bob essay<br>${'word '.repeat(300)}</p>`);
    peoplePosts.mockResolvedValueOnce({
      posts: wrap([long, ...mine, ...storm].reverse()),
      following: 2,
      relationshipsKnown: 2,
      scanComplete: false,
    });
    const el = await render();
    const titles = [...el.querySelectorAll('article h2 a')].map((a) => a.textContent?.trim());
    expect(titles).toEqual(['Bob essay', 'Ann storm']);
    expect(el.querySelector('a[href="/blog/@ann@far.example/10"]')).not.toBeNull();
    expect(el.querySelector('a[href="/blog/@bob@home.example"]')).not.toBeNull();
    expect(el.textContent).toContain('still collecting');
    expect(el.textContent).toContain('all 7 archived posts');
    expect(peoplePosts).toHaveBeenCalledWith('native-mastodon:x', 'all', 'all', 0);
  });

  it('reads ten full pages per step, then offers more', async () => {
    let n = 1000;
    peoplePosts.mockImplementation(async () => ({
      posts: wrap(Array.from({ length: 40 }, () => post(String(n--), bob, '<p>short</p>'))),
      following: 1,
      relationshipsKnown: 1,
      scanComplete: true,
    }));
    const el = await render();
    expect(peoplePosts).toHaveBeenCalledTimes(10);
    expect(peoplePosts.mock.calls[9][3]).toBe(360);
    expect(el.textContent).toContain('Look further back');
    expect(el.textContent).toContain('No storms or long posts yet');
  });
});
