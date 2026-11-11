import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Server } from './server';

/**
 * Unit tests for {@link Server}.
 * Focuses on the URL normalisation rules and the localStorage round-trip; no
 * Angular HttpClient involved because this service only manages state.
 */
describe('Server', () => {
  let server: Server;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [Server] });
    server = TestBed.inject(Server);
  });

  // ---------------------------------------------------------------- isMock / default

  it('defaults to the mock (empty baseUrl) when nothing is stored', () => {
    expect(server.baseUrl()).toBe('');
    expect(server.isMock).toBe(true);
  });

  // ---------------------------------------------------------------- normalisation

  it('setBaseUrl: accepts a full https URL unchanged', () => {
    server.setBaseUrl('https://mastodon.social');
    expect(server.baseUrl()).toBe('https://mastodon.social');
  });

  it('setBaseUrl: strips a trailing slash', () => {
    server.setBaseUrl('https://mastodon.social/');
    expect(server.baseUrl()).toBe('https://mastodon.social');
  });

  it('setBaseUrl: strips multiple trailing slashes', () => {
    server.setBaseUrl('https://mastodon.social///');
    expect(server.baseUrl()).toBe('https://mastodon.social');
  });

  it('setBaseUrl: prepends https:// when the scheme is missing', () => {
    server.setBaseUrl('mastodon.social');
    expect(server.baseUrl()).toBe('https://mastodon.social');
  });

  it('setBaseUrl: treats an empty string as "this server" (mock mode)', () => {
    server.setBaseUrl('https://mastodon.social');
    server.setBaseUrl('');
    expect(server.baseUrl()).toBe('');
    expect(server.isMock).toBe(true);
  });

  it('setBaseUrl: treats a whitespace-only string as "this server"', () => {
    server.setBaseUrl('   ');
    expect(server.baseUrl()).toBe('');
  });

  it('setBaseUrl: preserves an http:// scheme (non-https)', () => {
    server.setBaseUrl('http://localhost:3000');
    expect(server.baseUrl()).toBe('http://localhost:3000');
  });

  // ---------------------------------------------------------------- persistence

  it('persists the value to localStorage', () => {
    server.setBaseUrl('https://mastodon.art');
    expect(localStorage.getItem('mastodon_mock_server')).toBe('https://mastodon.art');
  });

  it('updates the signal reactively', () => {
    const values: string[] = [];
    // Capture signal reads manually (Angular effect is not needed for a simple read).
    server.setBaseUrl('https://fosstodon.org');
    values.push(server.baseUrl());
    server.setBaseUrl('https://mastodon.social');
    values.push(server.baseUrl());

    expect(values).toEqual(['https://fosstodon.org', 'https://mastodon.social']);
  });
});
