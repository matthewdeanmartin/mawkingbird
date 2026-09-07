import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CorsProxySettings } from '../../../../providers/cors-proxy/cors-proxy-settings';
import { ConnectionCorsProxy } from './connection-cors-proxy';
import { enableProxyFlags } from '../../../../testing/enable-proxy-flags';
import { corsProxyOrigin } from '../../../../build-flavor';

describe('ConnectionCorsProxy', () => {
  let fixture: ComponentFixture<ConnectionCorsProxy>;
  let settings: CorsProxySettings;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ConnectionCorsProxy],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    // These specs use a third-party proxy as the vehicle for testing proxy
    enableProxyFlags();
    fixture = TestBed.createComponent(ConnectionCorsProxy);
    settings = TestBed.inject(CorsProxySettings);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  const text = () => fixture.nativeElement.textContent as string;

  /** Press the radio for a proxy, the way the picker does. */
  const choose = (id: Parameters<ConnectionCorsProxy['choose']>[0]) => {
    fixture.componentInstance.choose(id);
    fixture.detectChanges();
  };

  const testButton = (): HTMLButtonElement | undefined =>
    [...fixture.nativeElement.querySelectorAll('button')].find((button) =>
      /Test proxy|Testing/.test((button as HTMLButtonElement).textContent ?? ''),
    ) as HTMLButtonElement | undefined;

  describe('switching proxies', () => {
    // The reported bug, in one test. A trial expires, the user picks a
    // replacement and presses Test, and the network shows a request to the *old*
    // proxy — because the selection only took effect on Save while Test read
    // what was saved. From the outside it looks like the picker is stuck.
    it('makes a newly chosen proxy the live one immediately', () => {
      settings.select('corsfix');
      choose('allorigins');

      expect(settings.currentId()).toBe('allorigins');
      expect(settings.resolve()?.entry.id).toBe('allorigins');
    });

    it('tests the proxy that is on screen, not the one it replaced', () => {
      settings.select('corsfix');
      choose('allorigins');

      fixture.componentInstance.runTest();
      const request = httpMock.expectOne((req) => req.url.includes('allorigins.win'));
      expect(request.request.url).not.toContain('corsfix');
      request.flush('<rss></rss>');
    });

    it('says which proxy took over, so the switch is not silent', () => {
      settings.select('corsfix');
      choose('allorigins');
      expect(text()).toContain('AllOrigins is now the active proxy');
    });
  });

  describe('the test request', () => {
    // The bug this pins: the preview rendered `example.com/feed.xml` while the
    // button fetched `w3.org`. A user reading a failure was being told about a
    // request that had never been made.
    it('previews exactly the URL it will request', () => {
      // `choose`, not `settings.select`: the preview renders from the on-screen
      // selection, which is what the user is reading when the test runs.
      choose('allorigins');

      const preview = fixture.componentInstance['preview']();
      fixture.componentInstance.runTest();
      const request = httpMock.expectOne(() => true);
      expect(request.request.url).toBe(preview);
      request.flush('<rss></rss>');
    });

    it('does not test against a URL that 404s', () => {
      // `example.com/feed.xml` does not exist. Testing a proxy by fetching a
      // page that is absent proves nothing and reports the absence as a proxy
      // fault.
      choose('allorigins');
      fixture.componentInstance.runTest();
      const request = httpMock.expectOne(() => true);
      expect(request.request.url).not.toContain('example.com');
      request.flush('<rss></rss>');
    });

    it('names its route on a routed proxy, so the request is not refused', () => {
      choose('mawkingbird');

      fixture.componentInstance.runTest();
      // Matched against the origin the build actually resolves, not a hostname
      // literal — the Workers moved from workers.dev to mawkingbird.com and a
      // literal here would break a test that was never about DNS.
      const request = httpMock.expectOne((req) => req.url.startsWith(corsProxyOrigin()));
      expect(request.request.url).toContain('route=feeds');
      expect(request.request.url).not.toContain('{route}');
      request.flush('<rss></rss>');
    });

    it('does not blame the key for an ambiguous 403', () => {
      // A 403 may be the proxy refusing us or the target refusing the proxy —
      // many sites block datacentre ranges. Asserting only the first sent people
      // to check a key that was never the problem.
      choose('allorigins');
      fixture.componentInstance.runTest();
      httpMock.expectOne(() => true).flush('no', { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();

      expect(text()).toContain('403');
      expect(text()).toMatch(/datacentre|datacenter/i);
    });
  });

  describe('the selections that cannot commit on click', () => {
    // Committing these would leave `resolve()` null — a "configured" proxy that
    // builds no request. The old selection stays live until Save, and the page
    // has to say so rather than let Test describe the wrong service.
    it('does not switch to a key-required proxy before a key exists', () => {
      settings.select('allorigins');
      choose('corssh');

      expect(settings.currentId()).toBe('allorigins');
    });

    it('switches to a key-required proxy once a key is already stored', () => {
      settings.select('allorigins');
      settings.setKey('a-key');
      choose('corssh');

      expect(settings.currentId()).toBe('corssh');
    });

    it('does not switch to custom before its template is saved', () => {
      settings.select('allorigins');
      choose('custom');

      expect(settings.currentId()).toBe('allorigins');
    });

    it('blocks the test button while the screen and the saved proxy disagree', () => {
      settings.select('allorigins');
      choose('corssh');
      fixture.detectChanges();

      expect(testButton()?.disabled).toBe(true);
      expect(text()).toContain('Save CORS.SH before testing it');
      // And it names what would otherwise have been tested behind the user's back.
      expect(text()).toContain('AllOrigins is still the one feeds use');
    });

    it('re-enables the test button once the pending choice is saved', () => {
      settings.select('allorigins');
      choose('custom');
      fixture.componentInstance['customTemplate'].set('https://mine.example.com/?url={url}');
      fixture.componentInstance.save();
      fixture.detectChanges();

      expect(settings.currentId()).toBe('custom');
      expect(testButton()?.disabled).toBe(false);
    });
  });

  it('offers cors.lol in the picker', () => {
    // Re-added after being struck off for rate-limiting; see the catalog note.
    expect(text()).toContain('cors.lol');
  });
});
