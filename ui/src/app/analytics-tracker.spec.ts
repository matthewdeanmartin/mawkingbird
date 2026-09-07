import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AnalyticsTracker, sanitizePath } from './analytics-tracker';
import { ClientPrefs } from './client-prefs';

describe('sanitizePath', () => {
  it('removes profile handles and provider URI suffixes', () => {
    expect(sanitizePath('/accounts/1198201/@publicvoit@graz.social')).toBe('/accounts/:id');
    expect(sanitizePath('/test/accounts/47341/@nolan@toot.cafe')).toBe('/test/accounts/:id');
    expect(
      sanitizePath('/test/statuses/bsky:at:%2F%2Fdid:plc:abc%2Fapp.bsky.feed.post%2F123'),
    ).toBe('/test/statuses/:id');
    expect(sanitizePath('/statuses/bsky:at://did:plc:abc/app.bsky.feed.post/123')).toBe(
      '/statuses/:id',
    );
    expect(sanitizePath('/read/112469071892317602')).toBe('/read/:id');
  });
  it('collapses account ids', () => {
    expect(sanitizePath('/accounts/111422974327710290')).toBe('/accounts/:id');
  });

  it('collapses status ids', () => {
    expect(sanitizePath('/statuses/109537754750046498')).toBe('/statuses/:id');
  });

  it('collapses tag lookups', () => {
    expect(sanitizePath('/tags/mastodon')).toBe('/tags/:id');
  });

  it('collapses ids under settings sub-routes', () => {
    expect(sanitizePath('/settings/filters/42')).toBe('/settings/filters/:id');
    expect(sanitizePath('/lists/7')).toBe('/lists/:id');
    expect(sanitizePath('/collections/abc')).toBe('/collections/:id');
  });

  it('strips the query string entirely', () => {
    expect(
      sanitizePath('/conversations?open=pub%3Acynical13%40vivaldi.net&with=109537754750046498'),
    ).toBe('/conversations');
  });

  it('strips the fragment', () => {
    expect(sanitizePath('/accounts/123#pinned')).toBe('/accounts/:id');
  });

  it('leaves static child routes readable', () => {
    expect(sanitizePath('/settings/filters/new')).toBe('/settings/filters/new');
    expect(sanitizePath('/collections/starter')).toBe('/collections/starter');
  });

  it('passes static routes through unchanged', () => {
    expect(sanitizePath('/home')).toBe('/home');
    expect(sanitizePath('/settings/privacy')).toBe('/settings/privacy');
    expect(sanitizePath('/')).toBe('/');
  });

  it('does not treat a bare collection route as an id', () => {
    expect(sanitizePath('/lists')).toBe('/lists');
  });
});

describe('AnalyticsTracker opt-out', () => {
  let router: { events: Subject<unknown> };

  function setUp(analyticsOn: boolean): AnalyticsTracker {
    localStorage.clear();
    localStorage.setItem('mockingbird_client_prefs', JSON.stringify({ analytics: analyticsOn }));
    router = { events: new Subject<unknown>() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    const tracker = TestBed.inject(AnalyticsTracker);
    tracker.start();
    return tracker;
  }

  function navigate(): void {
    router.events.next(new NavigationEnd(1, '/home', '/home'));
  }

  function injectedScript(): HTMLScriptElement | null {
    return document.head.querySelector('script[data-goatcounter]');
  }

  afterEach(() => {
    document.head.querySelector('base[data-analytics-test]')?.remove();
    injectedScript()?.remove();
    delete (window as { goatcounter?: unknown }).goatcounter;
    localStorage.clear();
  });

  it.each(['test', 'canary'])('never loads analytics on the %s deployment', (deployment) => {
    const base = document.createElement('base');
    base.href = `https://mawkingbird.com/${deployment}/`;
    base.setAttribute('data-analytics-test', '');
    document.head.prepend(base);
    setUp(true);
    navigate();
    expect(injectedScript()).toBeNull();
  });

  it('injects nothing at all when analytics are off', () => {
    // The whole point of the opt-out: not "we suppress the call" but "the
    // third-party script is never fetched or executed".
    setUp(false);
    navigate();
    expect(injectedScript()).toBeNull();
    expect((window as { goatcounter?: unknown }).goatcounter).toBeUndefined();
  });

  it('injects the same-origin script once when analytics are on', () => {
    setUp(true);
    navigate();
    navigate();

    const script = injectedScript();
    expect(script).not.toBeNull();
    // Same-origin and relative, so it resolves under <base href> and stays
    // inside `script-src 'self'`.
    expect(script!.getAttribute('src')).toBe('vendor/count.js');
    expect(script!.getAttribute('src')).not.toContain('//');
    expect(document.head.querySelectorAll('script[data-goatcounter]').length).toBe(1);
  });

  it('stops counting as soon as the pref is turned off', () => {
    setUp(true);
    navigate();
    const counted: string[] = [];
    (window as { goatcounter?: { count?: (v: { path: string }) => void } }).goatcounter = {
      count: (v) => counted.push(v.path),
    };

    navigate();
    expect(counted).toEqual(['/home']);

    // Turning it off mid-session takes effect on the very next view.
    TestBed.inject(ClientPrefs).setAnalytics(false);
    navigate();
    expect(counted).toEqual(['/home']);
  });
});
