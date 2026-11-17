import { TestBed } from '@angular/core/testing';
import { Status } from '../../platform/api/models';
import { matchesProfileContent, ProfileContentState } from './profile-content-filters';

const status = (overrides: Partial<Status>): Status =>
  ({
    id: '1',
    account: { id: 'author' },
    content: '<p>Hello</p>',
    card: null,
    media_attachments: [],
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    ...overrides,
  }) as Status;

describe('profile content facets', () => {
  it('separates external links from mention links and self replies from discussions', () => {
    const mention = status({
      content: '<a class="mention" href="https://example.org/@friend">@friend</a>',
    });
    expect(matchesProfileContent(mention, 'links')).toBe(false);
    const link = status({ card: { url: 'https://news.example/story' } as Status['card'] });
    expect(matchesProfileContent(link, 'links')).toBe(true);
    const selfReply = status({ in_reply_to_id: '2', in_reply_to_account_id: 'author' });
    expect(matchesProfileContent(selfReply, 'discussions')).toBe(false);
    const reply = status({ in_reply_to_id: '3', in_reply_to_account_id: 'friend' });
    expect(matchesProfileContent(reply, 'discussions')).toBe(true);
  });
});

describe('the rich filters (owner, 2026-11-17)', () => {
  it('finds articles, images, videos, audio, polls, quotes and code', () => {
    const article = status({
      card: { type: 'link', title: 'A headline', url: 'https://news.example/a' } as Status['card'],
    });
    const bareLink = status({ card: { type: 'link', title: '' } as Status['card'] });
    const video = status({ card: { type: 'video', title: 'Clip' } as Status['card'] });
    const image = status({ media_attachments: [{ type: 'image' }] as Status['media_attachments'] });
    const audio = status({ media_attachments: [{ type: 'audio' }] as Status['media_attachments'] });
    const poll = status({ poll: { id: 'p' } as Status['poll'] });
    const quote = status({ quote: { state: 'accepted' } as Status['quote'] });
    const code = status({ content: '<p>Try</p><pre><code>x()</code></pre>' });

    expect(matchesProfileContent(article, 'articles')).toBe(true);
    expect(matchesProfileContent(bareLink, 'articles')).toBe(false);
    expect(matchesProfileContent(video, 'articles')).toBe(false);
    expect(matchesProfileContent(video, 'videos')).toBe(true);
    expect(matchesProfileContent(image, 'images')).toBe(true);
    expect(matchesProfileContent(audio, 'audio')).toBe(true);
    expect(matchesProfileContent(poll, 'polls')).toBe(true);
    expect(matchesProfileContent(quote, 'quotes')).toBe(true);
    expect(matchesProfileContent(code, 'code')).toBe(true);
    expect(matchesProfileContent(code, 'polls')).toBe(false);
  });

  it('reads a boost by what it boosts, except for long posts and discussions', () => {
    const inner = status({
      id: '9',
      media_attachments: [{ type: 'image' }] as Status['media_attachments'],
    });
    const boost = status({ id: '10', reblog: inner });
    expect(matchesProfileContent(boost, 'images')).toBe(true);
    expect(matchesProfileContent(boost, 'longform', new Set(['10']))).toBe(false);
  });

  it('finds long posts with the Blog classifier', () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const state = TestBed.inject(ProfileContentState);
    const long = status({
      id: '1',
      content: `<p>${'word '.repeat(300)}</p>`,
      visibility: 'public',
      created_at: '2026-01-01T00:00:00Z',
    });
    const short = status({
      id: '2',
      content: '<p>hi</p>',
      visibility: 'public',
      created_at: '2026-01-02T00:00:00Z',
    });
    state.accountId.set('author');
    state.posts.set([long, short]);
    expect(state.counts().longform).toBe(1);
    expect(state.matches(long, 'longform')).toBe(true);
    expect(state.matches(short, 'longform')).toBe(false);
  });

  it('lets only the profile that claimed the widget release it', () => {
    TestBed.configureTestingModule({});
    const state = TestBed.inject(ProfileContentState);
    const first = {};
    const second = {};
    state.claim(first);
    state.claim(second);
    state.release(first);
    expect(state.active()).toBe(true);
    state.release(second);
    expect(state.active()).toBe(false);
  });
});
