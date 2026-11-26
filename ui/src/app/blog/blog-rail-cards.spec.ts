import { Auth } from '../platform/session/auth';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account, Status } from '../platform/api/models';
import { BlogAuthorCard, BlogMoreCard, BlogRecentCard } from './blog-rail-cards';
import { BlogContext } from './blog-context';
import { BlogHistory } from './blog-history';
import { BlogSource } from './blog-source';
import { BlogPost } from './blog-classifier';

const account = {
  id: '7',
  acct: 'alice',
  username: 'alice',
  display_name: 'Alice',
  avatar: '',
  note: '<p>I write about bees.</p>',
  emojis: [],
  url: 'https://far.example/@alice',
} as unknown as Account;
const author = { handle: 'alice@far.example', account, via: 'home' as const };

function entry(id: string, title: string): BlogPost {
  return { id, title, root: { id, url: `https://far.example/@alice/${id}` } as Status } as BlogPost;
}

describe('Blog rail cards', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  async function render(type: Type<unknown>) {
    const fixture = TestBed.createComponent(type);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows nothing without a blog on screen', async () => {
    for (const card of [BlogAuthorCard, BlogMoreCard, BlogRecentCard]) {
      expect((await render(card)).el.querySelector('section')).toBeNull();
    }
  });

  it('introduces the author, with All posts only on a post page', async () => {
    const context = TestBed.inject(BlogContext);
    context.show(author);
    const { fixture, el } = await render(BlogAuthorCard);
    expect(el.textContent).toContain('Alice');
    expect(el.textContent).toContain('I write about bees.');
    expect(el.textContent).not.toContain('All posts');
    context.show(author, '1');
    fixture.detectChanges();
    expect(el.querySelector('a[href="/blog/@alice@far.example"]')).not.toBeNull();
  });

  it('lists other posts from the blog on a post page, without the open one', async () => {
    TestBed.inject(BlogSource).remember('alice@far.example', [
      entry('3', 'Three'),
      entry('2', 'Two'),
      entry('1', 'One'),
    ]);
    const context = TestBed.inject(BlogContext);
    context.show(author);
    const { fixture, el } = await render(BlogMoreCard);
    expect(el.querySelector('section')).toBeNull();
    context.show(author, '2');
    fixture.detectChanges();
    const links = [...el.querySelectorAll('a')];
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Three', 'One']);
    expect(links[0].getAttribute('href')).toBe('/blog/@alice@far.example/3');
  });

  it('lists recently read blogs and clears them', async () => {
    TestBed.inject(BlogHistory).record({ handle: 'alice@far.example', name: 'Alice', avatar: '' });
    const { fixture, el } = await render(BlogRecentCard);
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/blog/@alice@far.example');
    el.querySelector('button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('section')).toBeNull();
  });

  it("leaves the reader's own blog out of recently read", async () => {
    const auth = TestBed.inject(Auth);
    auth.account.set({
      id: '9',
      acct: 'me',
      username: 'me',
      url: 'https://home.example/@me',
    } as Account);
    const history = TestBed.inject(BlogHistory);
    history.record({ handle: 'alice@far.example', name: 'Alice', avatar: '' });
    history.record({ handle: 'me@home.example', name: 'Me', avatar: '' });
    const { el } = await render(BlogRecentCard);
    const links = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/blog/@alice@far.example');
    expect(links).not.toContain('/blog/@me@home.example');
  });
});
