import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SearchServer } from './search-server';

describe('SearchServer', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [SearchServer] });
  });

  it('is inactive by default', () => {
    const service = TestBed.inject(SearchServer);
    expect(service.active()).toBe(false);
    expect(service.host()).toBeNull();
    expect(service.donateUrl()).toBeNull();
  });

  it('normalizes a bare host and exposes it for display and donation', () => {
    const service = TestBed.inject(SearchServer);
    service.setBaseUrl('mastodon.social');

    expect(service.baseUrl()).toBe('https://mastodon.social');
    expect(service.active()).toBe(true);
    expect(service.host()).toBe('mastodon.social');
    expect(service.donateUrl()).toBe('https://mastodon.social/about');
  });

  it('persists the choice across service instances', () => {
    TestBed.inject(SearchServer).setBaseUrl('mastodon.social');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [SearchServer] });

    expect(TestBed.inject(SearchServer).baseUrl()).toBe('https://mastodon.social');
  });

  it('clear() goes back to searching on the primary server', () => {
    const service = TestBed.inject(SearchServer);
    service.setBaseUrl('mastodon.social');
    service.clear();

    expect(service.active()).toBe(false);
    expect(service.baseUrl()).toBe('');
  });

  it('keeps http for local dev targets rather than forcing https', () => {
    const service = TestBed.inject(SearchServer);
    service.setBaseUrl('localhost:3000');

    expect(service.baseUrl()).toBe('http://localhost:3000');
  });
});
