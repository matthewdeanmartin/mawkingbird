import { Status } from '../../platform/api/models';
import { matchesProfileContent } from './profile-content-filters';

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
