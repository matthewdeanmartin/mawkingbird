import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CorsProxySettings } from '../../../../providers/cors-proxy/cors-proxy-settings';
import { ProxyConsent } from '../../../../providers/proxy-consent-store';
import { TwitterSettings } from '../../../../providers/twitter/twitter-settings';
import { ConnectionTwitter } from './connection-twitter';
import { enableProxyFlags } from '../../../../testing/enable-proxy-flags';

describe('ConnectionTwitter', () => {
  let fixture: ComponentFixture<ConnectionTwitter>;
  let settings: TwitterSettings;
  let proxySettings: CorsProxySettings;
  let consent: ProxyConsent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ConnectionTwitter],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    // These specs use a third-party proxy as the vehicle for testing proxy
    enableProxyFlags();
    fixture = TestBed.createComponent(ConnectionTwitter);
    settings = TestBed.inject(TwitterSettings);
    proxySettings = TestBed.inject(CorsProxySettings);
    consent = TestBed.inject(ProxyConsent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  const text = () => fixture.nativeElement.textContent as string;

  describe('the setup checklist', () => {
    // Five stages across two services is the most setup of any connector here.
    // One sentence naming the current stage is what keeps that navigable.
    it('starts by asking for a key', () => {
      expect(text()).toContain('Paste your API key');
    });

    it('asks for a test once a key exists', () => {
      settings.setKey('twitterapi-io', 'k');
      settings.activate('twitterapi-io');
      fixture.detectChanges();
      expect(text()).toMatch(/Press Test connection/);
    });

    it('asks for a proxy once the direct attempt has been seen to fail', () => {
      settings.setKey('twitterapi-io', 'k');
      settings.activate('twitterapi-io');
      settings.recordDirectReachability('twitterapi-io', 'blocked');
      fixture.detectChanges();
      expect(text()).toMatch(/Set up a CORS proxy/);
    });

    it('warns when the chosen proxy cannot carry a key', () => {
      settings.setKey('twitterapi-io', 'k');
      settings.activate('twitterapi-io');
      settings.recordDirectReachability('twitterapi-io', 'blocked');
      // AllOrigins strips custom headers: the key would silently vanish and the
      // service's "no key" reply would look like the user's key was wrong.
      proxySettings.select('allorigins');
      fixture.detectChanges();
      expect(text()).toMatch(/cannot carry API keys|does not forward custom headers/i);
    });

    it('asks for consent once a usable proxy is configured', () => {
      settings.setKey('twitterapi-io', 'k');
      settings.activate('twitterapi-io');
      settings.recordDirectReachability('twitterapi-io', 'blocked');
      proxySettings.select('corssh');
      proxySettings.setKey('proxy-key');
      fixture.detectChanges();
      expect(text()).toMatch(/accept the disclosure/i);
    });
  });

  describe('honesty about what this connector is', () => {
    it('says up front that it is read-only and needs a key and a proxy', () => {
      const body = text();
      expect(body).toMatch(/read-only/i);
      expect(body).toMatch(/CORS proxy/);
      expect(body).toMatch(/bring your own key/i);
      // The three things that make this connector harder than the others, all
      // stated before the user spends any effort on it.
      expect(body).toMatch(/no free API/i);
    });

    it('explains that following here is local and not a follow on Twitter', () => {
      // The single most likely misunderstanding: someone believing they have
      // followed a person on Twitter, and that the person was notified.
      expect(text()).toMatch(/not a follow on Twitter/i);
    });

    it('states the cost of pressing Test before it is pressed', () => {
      expect(text()).toMatch(/costs up to two requests/i);
    });
  });

  describe('the proxy section', () => {
    it('says the connector will not work when no proxy is configured', () => {
      expect(text()).toMatch(/No CORS proxy is configured/i);
    });

    it('surfaces a proxy domain-registration requirement as a setup step', () => {
      // Corsfix answers localhost automatically but 403s an unregistered
      // deployed origin. That is an instruction, not a fault.
      proxySettings.select('corsfix');
      fixture.detectChanges();
      expect(text()).toMatch(/dashboard/i);
    });
  });

  describe('the saved-key note', () => {
    it('separates the retention date from the sentence before it', () => {
      // Regression: expiryLabel returns a bare date, so interpolating it inline
      // rendered "Paste a new one to replace itOctober 29, 2026."
      settings.setKey('twitterapi-io', 'k');
      settings.activate('twitterapi-io');
      fixture.detectChanges();

      const body = text();
      expect(body).toMatch(/replace it\./);
      expect(body).not.toMatch(/replace it[A-Z]/);
    });
  });

  describe('disconnect', () => {
    it('removes the key and any proxy consent', () => {
      settings.setKey('twitterapi-io', 'k');
      settings.activate('twitterapi-io');
      consent.grant('twitterapi-io', 'corssh');

      fixture.componentInstance['forget']('twitterapi-io');

      expect(settings.hasKey('twitterapi-io')).toBe(false);
      expect(consent.granted('twitterapi-io', 'corssh')).toBe(false);
      // The probe verdict goes too, so reconnecting re-tests rather than
      // trusting a months-old answer.
      expect(settings.directReachability('twitterapi-io')).toBe('untested');
    });
  });

  describe('declining consent', () => {
    it('explains that the connector simply cannot work without it', () => {
      // Unlike the shortener, refusing here does not degrade the feature to a
      // slower path — there is no other path at all, and saying so is honest.
      settings.setKey('twitterapi-io', 'k');
      settings.activate('twitterapi-io');
      proxySettings.select('corssh');
      proxySettings.setKey('proxy-key');

      fixture.componentInstance['consentPrompt'].set({
        source: fixture.componentInstance['entry'](),
        proxy: proxySettings.chosen()!,
      });
      fixture.componentInstance['declineConsent']();
      fixture.detectChanges();

      expect(text()).toMatch(/cannot be read from a browser at all/i);
    });
  });
});
