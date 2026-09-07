import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MataroaSettings, normalizeBlogUrl } from './mataroa-settings';

describe('MataroaSettings', () => {
  beforeEach(() => localStorage.clear());

  it('stores one account-scoped connection and derives its RSS feed', () => {
    const settings = TestBed.inject(MataroaSettings);
    settings.connect('secret-key', 'writer.mataroa.blog', true);

    expect(settings.connected()).toBe(true);
    expect(settings.blogUrl()).toBe('https://writer.mataroa.blog/');
    expect(settings.feedUrl()).toBe('https://writer.mataroa.blog/rss/');
    expect(settings.includeInProfile()).toBe(true);
    expect(localStorage.getItem('mockingbird_mataroa_connection')).toContain('secret-key');
  });

  it('updates the profile-feed opt-in without replacing the credential', () => {
    const settings = TestBed.inject(MataroaSettings);
    settings.connect('secret-key', 'https://writer.mataroa.blog/', false);
    settings.setIncludeInProfile(true);

    expect(settings.includeInProfile()).toBe(true);
    expect(settings.resolve()?.apiKey).toBe('secret-key');
  });

  it('normalizes custom-domain blog addresses to their root', () => {
    expect(normalizeBlogUrl('https://words.example/posts?x=1#top')).toBe('https://words.example/');
  });
});
