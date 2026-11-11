import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Drafts } from '../drafts';
import { AppInstall, installRouteFor } from './app-install';
import { sharedText, ShareTarget } from './share-target';

describe('installRouteFor', () => {
  it('uses the real prompt whenever the browser offered one', () => {
    expect(installRouteFor('anything', true)).toBe('prompt');
  });

  it('gives iPhone, Mac Safari and other browsers their own instructions', () => {
    expect(
      installRouteFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', false),
    ).toBe('ios');
    expect(
      installRouteFor(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
        false,
      ),
    ).toBe('mac-safari');
    expect(installRouteFor('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Firefox/140.0', false)).toBe(
      'manual',
    );
  });
});

describe('AppInstall', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('holds back the browser prompt and shows it on request', async () => {
    const install = TestBed.inject(AppInstall);
    expect(install.canPrompt()).toBe(false);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(install.canPrompt()).toBe(true);
    await expect(install.prompt()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    expect(install.canPrompt()).toBe(false);
    window.dispatchEvent(new Event('appinstalled'));
    expect(install.installed()).toBe(true);
  });
});

describe('sharedText', () => {
  it('keeps each shared piece once', () => {
    expect(sharedText({ title: 'Great read', text: '', url: 'https://ex.com/a' })).toBe(
      'Great read\n\nhttps://ex.com/a',
    );
    // Android Chrome: the link is inside text already.
    expect(
      sharedText({
        title: 'Great read',
        text: 'Great read https://ex.com/a',
        url: 'https://ex.com/a',
      }),
    ).toBe('Great read https://ex.com/a');
    expect(sharedText({ text: 'Just words' })).toBe('Just words');
    expect(sharedText({})).toBe('');
  });
});

describe('ShareTarget', () => {
  afterEach(() => TestBed.resetTestingModule());

  function open(params: Record<string, string>) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(params) } },
        },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const handoff = vi.spyOn(TestBed.inject(Drafts), 'handoff').mockImplementation(() => undefined);
    TestBed.createComponent(ShareTarget).detectChanges();
    return { navigate, handoff };
  }

  it('parks the shared link in an unsent post and goes Home without posting', () => {
    const { navigate, handoff } = open({ title: 'A post', url: 'https://ex.com/p' });
    expect(handoff).toHaveBeenCalledWith(
      expect.objectContaining({ segments: ['A post\n\nhttps://ex.com/p'], poll: null }),
    );
    expect(navigate).toHaveBeenCalledWith(['/home'], { replaceUrl: true });
  });

  it('just goes Home when nothing usable was shared', () => {
    const { navigate, handoff } = open({});
    expect(handoff).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalled();
  });
});
