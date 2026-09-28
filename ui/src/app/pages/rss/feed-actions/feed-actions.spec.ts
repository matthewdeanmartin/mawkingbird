import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, vi } from 'vitest';
import { RssFeedActions } from './feed-actions';
import { RssSubscriptions } from '../../../providers/rss/rss-subscriptions';
import { Status } from '../../../models';
import { translocoTesting } from '../../../i18n/i18n.testing';

describe('RssFeedActions direct actions', () => {
  async function setup(subscribed: boolean, id = 'rss:https://example.test/feed?x=1') {
    const remove = vi.fn();
    await TestBed.configureTestingModule({
      imports: [RssFeedActions, translocoTesting()],
      providers: [
        provideRouter([]),
        {
          provide: RssSubscriptions,
          useValue: {
            has: () => subscribed,
            feeds: () => [],
            remove,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(RssFeedActions);
    fixture.componentRef.setInput('status', {
      provider: 'rss',
      account: { id, display_name: 'Feed' },
    } as Status);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, remove };
  }
  it('keeps native feed navigation without offering unsubscribe for an absent subscription', async () => {
    const { element, remove } = await setup(false);
    const link = element.querySelector('a')!;
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain(
      'rss:https://example.test/feed?x=1',
    );
    expect(element.querySelector('mb-post-actions button')).toBeNull();
    expect(element.querySelector('mb-post-actions')).not.toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
  it('offers no feed action for an article-author identity that is not a feed URL', async () => {
    const { element, remove } = await setup(true, 'rss:https://example.test/feed::author::alice');
    expect(element.querySelector('mb-post-actions')).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});
