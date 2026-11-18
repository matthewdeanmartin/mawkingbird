import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YoutubeComments } from './youtube-comments';
import { YoutubeFeeds } from '../videos/youtube-feeds';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { YoutubeComment, YoutubeCommentPage } from '../videos/youtube-details';

const comment = (id: string, text: string): YoutubeComment => ({
  id,
  author: `@${id}`,
  published: '1 day ago',
  likes: '5',
  text,
  replies: '',
  byCreator: false,
});

describe('YoutubeComments', () => {
  let fixture: ComponentFixture<YoutubeComments>;
  afterEach(() => fixture?.destroy());

  function mount(comments: YoutubeFeeds['comments'], filters: unknown[] = []) {
    TestBed.configureTestingModule({
      imports: [YoutubeComments],
      providers: [
        { provide: YoutubeFeeds, useValue: { comments } },
        { provide: Api, useValue: { filters: () => of(filters) } },
        { provide: Auth, useValue: { kind: signal('mastodon'), isAnonymous: false } },
      ],
    });
    fixture = TestBed.createComponent(YoutubeComments);
    fixture.componentRef.setInput('videoId', 'abcdefghijk');
    fixture.detectChanges();
  }

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const text = () => fixture.nativeElement.textContent as string;

  it('shows comments as text, hides and folds by the reader’s filters, and pages on request', async () => {
    const second: YoutubeCommentPage = { comments: [comment('c4', 'Later one')], more: null };
    const comments = vi.fn(async (): Promise<YoutubeCommentPage> => ({
      comments: [
        comment('c1', '<img src=x onerror=alert(1)> plain'),
        comment('c2', 'buy crypto now'),
        comment('c3', 'big spoilers here'),
      ],
      more: async () => second,
    }));
    const filter = (keyword: string, action: string) => ({
      context: ['thread'],
      filter_action: action,
      expires_at: null,
      keywords: [{ keyword, whole_word: true }],
    });
    mount(comments, [filter('crypto', 'hide'), filter('spoilers', 'warn')]);
    await settle();
    expect(comments).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(text()).toContain('<img src=x onerror=alert(1)> plain');
    expect(text()).not.toContain('crypto');
    expect(text()).not.toContain('big spoilers');
    expect(text()).toContain('Hidden by one of your filters.');

    const buttons = () =>
      [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    buttons()
      .find((b) => b.textContent?.includes('Show'))!
      .click();
    fixture.detectChanges();
    expect(text()).toContain('big spoilers here');

    buttons()
      .find((b) => b.textContent?.includes('More comments'))!
      .click();
    await settle();
    expect(text()).toContain('Later one');
    expect(buttons().some((b) => b.textContent?.includes('More comments'))).toBe(false);
  });

  it('offers a retry when YouTube returns nothing usable', async () => {
    const comments = vi
      .fn<YoutubeFeeds['comments']>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce({ comments: [comment('c1', 'Back again')], more: null });
    mount(comments);
    await settle();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await settle();
    expect(text()).toContain('Back again');
  });

  it('emits a comment to quote', async () => {
    mount(async () => ({ comments: [comment('c1', 'Quote me')], more: null }));
    await settle();
    const quoted = vi.fn();
    fixture.componentInstance.quoted.subscribe(quoted);
    const quote = [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLElement) =>
      b.textContent?.includes('Quote in a post'),
    ) as HTMLButtonElement;
    quote.click();
    expect(quoted).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });
});
