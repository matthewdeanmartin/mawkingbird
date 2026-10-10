import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OtherServers } from './other-servers';
import { MastodonServers } from '../../mastodon-servers';
import { FEED_SECTIONS } from '../lists/lists';

describe('Other Servers directory', () => {
  const directory = {
    servers: signal([
      {
        domain: 'foobar.social',
        description: 'Artists and photography',
        category: 'Art',
        users: 1000,
      },
      {
        domain: 'garden.social',
        description: 'Chickens and gardening',
        category: 'Nature',
        users: 50,
      },
    ]),
    loading: signal(false),
    ready: vi.fn().mockResolvedValue(undefined),
  };
  beforeEach(() => {
    directory.ready.mockClear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MastodonServers, useValue: directory }],
    });
  });

  it('places the category between Your Server Feeds and Followed hashtags', () => {
    const ids = FEED_SECTIONS.map((section) => section.id);
    expect(ids.slice(ids.indexOf('server'), ids.indexOf('server') + 3)).toEqual([
      'server',
      'other-servers',
      'tags',
    ]);
  });

  it('uses the login directory, searches descriptions, and links to the selected server', () => {
    const fixture = TestBed.createComponent(OtherServers);
    fixture.detectChanges();
    expect(directory.ready).toHaveBeenCalledOnce();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('a[href="/feeds/servers/foobar.social"]')).not.toBeNull();
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'chickens';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelector('a[href="/feeds/servers/foobar.social"]')).toBeNull();
    expect(root.querySelector('a[href="/feeds/servers/garden.social"]')).not.toBeNull();
  });

  it('offers the same four feed types for a selected server without loading the whole directory', () => {
    const fixture = TestBed.createComponent(OtherServers);
    fixture.componentRef.setInput('server', 'FOOBAR.SOCIAL');
    fixture.detectChanges();
    expect(directory.ready).not.toHaveBeenCalled();
    const root = fixture.nativeElement as HTMLElement;
    for (const feed of ['local', 'federated', 'trending', 'news']) {
      expect(root.querySelector(`a[href="/feeds/servers/foobar.social/${feed}"]`)).not.toBeNull();
    }
    expect(root.textContent).toContain('foobar.social');
  });
});
