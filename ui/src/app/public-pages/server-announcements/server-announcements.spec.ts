import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { ServerAnnouncements } from './server-announcements';

describe('ServerAnnouncements server links', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).token.set('server-page-token');
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function setUp(): ComponentFixture<ServerAnnouncements> {
    const fixture = TestBed.createComponent(ServerAnnouncements);
    fixture.detectChanges();
    // The page's own loads: announcements and the instance header.
    http
      .match((r) => r.url.includes('/instance') && !r.url.includes('/instance/'))
      .forEach((r) =>
        r.flush({
          title: 'Home',
          domain: 'home.example',
          description: '',
          version: '4.5.0',
          thumbnail: { url: null },
          usage: { users: { active_month: 1 } },
        }),
      );
    http.match(() => true).forEach((r) => r.flush([]));
    fixture.detectChanges();
    return fixture;
  }

  it('lists the server documents as links beside the donate links, fetching none of them', () => {
    const fixture = setUp();
    http.expectNone('/api/v1/instance/privacy_policy');
    http.expectNone('/api/v1/instance/domain_blocks');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('details')).toBeNull();
    const links = [...el.querySelectorAll('.server-links a')];
    const internal = links
      .map((a) => a.getAttribute('href'))
      .filter((href) => href?.startsWith('/server-'));
    expect(internal).toEqual(['/server-rules', '/server-privacy', '/server-moderated']);
    expect(links.map((a) => a.textContent?.trim())).toEqual(
      expect.arrayContaining(['🔒 Privacy policy', '🛡️ Moderated servers']),
    );
  });
});
