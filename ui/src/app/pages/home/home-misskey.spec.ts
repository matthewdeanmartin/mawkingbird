import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { ClientPrefs } from '../../client-prefs';
import { HomeDiagnostics } from '../../home-diagnostics';
import { saveMisskeyIdentity } from '../../providers/misskey/misskey-identity-store';
import { Streaming } from '../../streaming';
import { FakeStreaming } from '../../testing/fake-streaming';
import { Home } from './home';
import { MISSKEY_PERMISSIONS } from '../../providers/misskey/misskey-auth';
import { BrowserTranslator } from '../../translation/browser-translator';
import { TranslationConnectors } from '../../translation/translation-connectors';
import { TranslationRouter } from '../../translation/translation-router';

const SERVER = 'https://misskey.design';

/**
 * Home for a Misskey-primary account (M1 + T1): the Misskey timeline picker,
 * no composer, a one-time translate-as-you-scroll offer, and never a Mastodon
 * request.
 */
describe('Home as a Misskey account', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: new FakeStreaming() },
        { provide: HomeDiagnostics, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok' },
    );
    TestBed.inject(Auth).enterMisskey(key);
    TestBed.inject(ClientPrefs).setHomeWindow('all');
  });

  afterEach(() => {
    // Whatever else Home asked for, it must never have been the Mastodon API.
    expect(http.match((r) => r.url.startsWith('/api/v1') || r.url.startsWith('/api/v2'))).toEqual(
      [],
    );
    localStorage.clear();
  });

  async function setUp(): Promise<ComponentFixture<Home>> {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const timeline = await vi.waitFor(() => http.expectOne(`${SERVER}/api/notes/timeline`));
    timeline.flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: ComponentFixture<Home>) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('shows the Misskey timeline picker and no composer', async () => {
    const fixture = await setUp();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.home-misskey-timelines')).not.toBeNull();
    expect(el.querySelector('.write-cta')).toBeNull();
    expect(el.querySelector('app-compose')).toBeNull();
  });

  it('offers translate-as-you-scroll once, and accepting turns it on', async () => {
    const fixture = await setUp();
    const offer = (fixture.nativeElement as HTMLElement).querySelector('.home-translate-offer');
    expect(offer).not.toBeNull();
    const yes = offer!.querySelectorAll('button')[0] as HTMLButtonElement;
    yes.click();
    fixture.detectChanges();
    const prefs = TestBed.inject(ClientPrefs);
    expect(prefs.autoTranslateMode()).toBe('view');
    expect(prefs.translateAllForeign()).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.home-translate-offer'),
    ).toBeNull();
  });

  it('declining leaves translation off and does not ask again', async () => {
    const fixture = await setUp();
    const offer = (fixture.nativeElement as HTMLElement).querySelector('.home-translate-offer');
    (offer!.querySelectorAll('button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(TestBed.inject(ClientPrefs).autoTranslateMode()).toBe('off');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.home-translate-offer'),
    ).toBeNull();
    fixture.destroy();
    const again = await setUp();
    expect((again.nativeElement as HTMLElement).querySelector('.home-translate-offer')).toBeNull();
  });

  it('does not offer when the reader already translates as they scroll', async () => {
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setAutoTranslateMode('view');
    prefs.setTranslateAllForeign(true);
    const fixture = await setUp();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.home-translate-offer'),
    ).toBeNull();
    expect(text(fixture)).not.toContain('Translate as you scroll?');
  });

  it('says so when automatic translation is on but nothing can translate', async () => {
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setAutoTranslateMode('view');
    prefs.setTranslateAllForeign(true);
    vi.spyOn(TestBed.inject(BrowserTranslator), 'supported').mockReturnValue(false);
    const fixture = await setUp();
    // misskey.design-style: the server reports no translator.
    (await vi.waitFor(() => http.expectOne(`${SERVER}/api/meta`))).flush({
      translatorAvailable: false,
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.home-no-translator'),
      ).not.toBeNull();
    });
    const turnOn = (fixture.nativeElement as HTMLElement).querySelector(
      '.home-no-translator button',
    ) as HTMLButtonElement;
    turnOn.click();
    expect(TestBed.inject(TranslationConnectors).myMemoryEnabled()).toBe(true);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.home-no-translator'),
      ).toBeNull();
    });
  });

  it('asks a read-only (M1) sign-in to approve writing once, with no composer', async () => {
    const fixture = await setUp();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.home-misskey-approve')).not.toBeNull();
    expect(el.querySelector('app-misskey-compose')).toBeNull();
  });

  it('shows the Misskey composer once the token may write', async () => {
    saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok', permissions: [...MISSKEY_PERMISSIONS] },
    );
    const fixture = await setUp();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-misskey-compose')).not.toBeNull();
    expect(el.querySelector('.home-misskey-approve')).toBeNull();
  });

  it('offers AI in the no-translator notice when OpenRouter is connected', async () => {
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setAutoTranslateMode('view');
    prefs.setTranslateAllForeign(true);
    vi.spyOn(TestBed.inject(BrowserTranslator), 'supported').mockReturnValue(false);
    vi.spyOn(TestBed.inject(TranslationRouter), 'aiConnected').mockReturnValue(true);
    const fixture = await setUp();
    (await vi.waitFor(() => http.expectOne(`${SERVER}/api/meta`))).flush({
      translatorAvailable: false,
    });
    let useAi: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      fixture.detectChanges();
      useAi = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.home-no-translator button'),
      ).find((b) => b.textContent?.includes('$0.25')) as HTMLButtonElement | undefined;
      expect(useAi).toBeDefined();
    });
    useAi!.click();
    expect(prefs.autoTranslateUsesAi()).toBe(true);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.home-no-translator'),
      ).toBeNull();
    });
  });
});
