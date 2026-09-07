import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstanceStatus, normalizeInstanceDomain } from './instance-status';
import { Server } from './server';

const ABOUT_URL = '/api/v1/instance/extended_description';

describe('normalizeInstanceDomain', () => {
  it('accepts a plain https instance origin, lowercased', () => {
    expect(normalizeInstanceDomain('https://Mastodon.Social')).toBe('mastodon.social');
  });

  it('rejects the mock (empty base URL)', () => {
    expect(normalizeInstanceDomain('')).toBeNull();
  });

  it.each([
    ['http origin', 'http://mastodon.social'],
    ['explicit port', 'https://mastodon.social:8443'],
    ['embedded credentials', 'https://user:pw@mastodon.social'],
    ['IPv4 address', 'https://192.168.1.1'],
    ['IPv6 address', 'https://[::1]'],
    ['single-label host', 'https://localhost'],
    ['onion address', 'https://abcdefgh.onion'],
    ['garbage', 'not a url'],
  ])('rejects %s', (_name, input) => {
    expect(normalizeInstanceDomain(input)).toBeNull();
  });
});

describe('InstanceStatus', () => {
  let httpMock: HttpTestingController;
  let server: Server;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    server = TestBed.inject(Server);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /** Instantiate the service and flush its discovery effect. */
  function init(): InstanceStatus {
    const status = TestBed.inject(InstanceStatus);
    TestBed.tick();
    return status;
  }

  it('offers no link and no domain for the mock ("this server")', () => {
    const status = init();
    expect(status.currentDomain()).toBeNull();
    expect(status.statusLink()).toBeNull();
    httpMock.expectNone(ABOUT_URL); // no discovery for the mock
  });

  it('serves curated registry instances as official links, without discovery', () => {
    server.setBaseUrl('https://mastodon.social');
    const status = init();
    const link = status.statusLink()!;
    expect(link.url).toBe('https://status.mastodon.social/');
    expect(link.kind).toBe('official');
    expect(link.label).toBe('Check instance status');
    httpMock.expectNone(ABOUT_URL);
  });

  it('discovers an administrator-provided status link from the about page', () => {
    server.setBaseUrl('https://example.social');
    const status = init();
    httpMock.expectOne(ABOUT_URL).flush({
      content: '<p>Check our <a href="https://status.example.social/">service status</a>.</p>',
    });
    const link = status.statusLink()!;
    expect(link.url).toBe('https://status.example.social/');
    expect(link.kind).toBe('administrator-provided');
    expect(link.label).toBe('Check instance status');
  });

  it('recognizes status links by hostname even with an unrelated label', () => {
    server.setBaseUrl('https://example.social');
    const status = init();
    httpMock.expectOne(ABOUT_URL).flush({
      content: '<a href="https://status.example.social/">see here</a>',
    });
    expect(status.statusLink()!.kind).toBe('administrator-provided');
  });

  it('ignores unsafe about-page links (http, credentials, fragments)', () => {
    server.setBaseUrl('https://example.social');
    const status = init();
    httpMock.expectOne(ABOUT_URL).flush({
      content:
        '<a href="http://status.example.social/">status</a>' +
        '<a href="https://user:pw@status.example.social/">uptime</a>' +
        '<a href="https://example.social/about#status">status</a>',
    });
    expect(status.statusLink()!.kind).toBe('third-party');
  });

  it('falls back to a labelled Fediverse Observer link when discovery finds nothing', () => {
    server.setBaseUrl('https://example.social');
    const status = init();
    httpMock.expectOne(ABOUT_URL).flush({ content: '<p>No links here.</p>' });
    const link = status.statusLink()!;
    expect(link.url).toBe('https://fediverse.observer/example.social');
    expect(link.kind).toBe('third-party');
    expect(link.label).toBe('View third-party uptime information');
  });

  it('still offers the third-party link when the about page is unreachable', () => {
    server.setBaseUrl('https://example.social');
    const status = init();
    httpMock.expectOne(ABOUT_URL).error(new ProgressEvent('error'), { status: 0 });
    expect(status.statusLink()!.kind).toBe('third-party');
  });

  it('persists discoveries and skips re-discovery while the cache is fresh', () => {
    server.setBaseUrl('https://example.social');
    const status = init();
    httpMock.expectOne(ABOUT_URL).flush({
      content: '<a href="https://status.example.social/">status</a>',
    });
    expect(status.statusLink()!.url).toBe('https://status.example.social/');

    // A fresh service instance (new session) reads the cache and does not refetch.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(Server).setBaseUrl('https://example.social');
    const revived = TestBed.inject(InstanceStatus);
    TestBed.tick();
    TestBed.inject(HttpTestingController).expectNone(ABOUT_URL);
    expect(revived.statusLink()!.url).toBe('https://status.example.social/');
  });

  it('revalidates a stale cached record', () => {
    const stale = {
      'example.social': {
        statusPage: 'https://status.example.social/',
        source: 'instance-about-page',
        verifiedAt: '2020-01-01T00:00:00Z',
      },
    };
    localStorage.setItem('mockingbird_instance_status_pages', JSON.stringify(stale));
    server.setBaseUrl('https://example.social');
    init();
    httpMock.expectOne(ABOUT_URL).flush({ content: '' });
  });

  it('re-discovers when switching to another instance', () => {
    server.setBaseUrl('https://example.social');
    init();
    httpMock.expectOne(ABOUT_URL).flush({ content: '' });
    server.setBaseUrl('https://other.social');
    TestBed.tick();
    httpMock.expectOne(ABOUT_URL).flush({ content: '' });
  });
});
