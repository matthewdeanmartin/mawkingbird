import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { rssSourceUrl } from './rss-source';

describe('RSS subscription source', () => {
  it('uses the complete feed identity rather than the article URL or publisher host', () => {
    const url = 'https://example.com/index.php?feed=atom&action=changes';
    const status = {
      provider: 'rss',
      url: 'https://example.com/article',
      account: { id: 'rss:' + url },
    } as Status;
    expect(rssSourceUrl(status)).toBe(url);
  });
  it('does not offer subscription actions for comment authors or unsafe identities', () => {
    for (const id of [
      'rss:https://example.com/feed::author::Jane',
      'rss:javascript:alert(1)',
      'bsky:did:plc:me',
    ]) {
      expect(rssSourceUrl({ provider: 'rss', account: { id } } as Status)).toBeNull();
    }
  });
});
