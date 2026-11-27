import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../platform/api/models';
import { Compose } from '../../publishing/compose/compose';
import { DraftSnapshot, Drafts, emptyDraftSnapshot } from '../../publishing/drafts';
import { AppInstall, installRouteFor } from './app-install';
import { SHARE_TARGET_DRAFT_CONTEXT, sharedText, ShareTarget } from './share-target';

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

  @Component({ selector: 'app-compose', template: '<textarea></textarea>' })
  class ComposeStub {
    readonly draftContext = input('');
    readonly initialText = input('');
    readonly posted = output<Status>();
  }

  function open(params: Record<string, string>, saved: DraftSnapshot | null = null) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(params) } },
        },
      ],
    });
    TestBed.overrideComponent(ShareTarget, {
      remove: { imports: [Compose] },
      add: { imports: [ComposeStub] },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const drafts = TestBed.inject(Drafts);
    const handoff = vi.spyOn(drafts, 'handoff').mockImplementation(() => undefined);
    const clear = vi.spyOn(drafts, 'clearAutosave');
    const load = vi.spyOn(drafts, 'loadAutosave').mockReturnValue(saved);
    const fixture = TestBed.createComponent(ShareTarget);
    fixture.autoDetectChanges();
    return { fixture, navigate, handoff, clear, load };
  }

  const compose = (fixture: ComponentFixture<ShareTarget>) =>
    fixture.debugElement.query((d) => d.name === 'app-compose')?.componentInstance as
      ComposeStub | undefined;

  it('opens the shared text in a composer dialog, focused at the top, without posting', async () => {
    const { fixture, navigate, clear } = open({ title: 'A post', url: 'https://ex.com/p' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('mb-dialog')).not.toBeNull();
    expect(compose(fixture)?.initialText()).toBe(`A post${'\n\n'}https://ex.com/p`);
    expect(compose(fixture)?.draftContext()).toBe(SHARE_TARGET_DRAFT_CONTEXT);
    // A fresh share replaces any leftover from an earlier one.
    expect(clear).toHaveBeenCalledWith(SHARE_TARGET_DRAFT_CONTEXT);
    const box = el.querySelector('textarea')!;
    expect(document.activeElement).toBe(box);
    expect(box.selectionStart).toBe(0);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes Home once posted', async () => {
    const { fixture, navigate, handoff } = open({ url: 'https://ex.com/p' });
    await fixture.whenStable();
    compose(fixture)!.posted.emit({} as Status);
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/home'], { replaceUrl: true });
    expect(handoff).not.toHaveBeenCalled();
  });

  it("cancel discards the shared post, leaving Home's composer empty", async () => {
    const saved = {
      ...emptyDraftSnapshot('public'),
      segments: [`My take${'\n\n'}https://ex.com/p`],
    };
    const { fixture, navigate, handoff, clear } = open({ url: 'https://ex.com/p' }, saved);
    await fixture.whenStable();
    clear.mockClear();
    fixture.debugElement
      .query((d) => d.name === 'mb-dialog')
      .triggerEventHandler('dismissed', 'escape');
    await fixture.whenStable();
    expect(compose(fixture)).toBeUndefined();
    expect(handoff).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith(SHARE_TARGET_DRAFT_CONTEXT);
    expect(navigate).toHaveBeenCalledWith(['/home'], { replaceUrl: true });
  });

  it('just goes Home when nothing usable was shared', () => {
    const { fixture, navigate, handoff } = open({});
    expect((fixture.nativeElement as HTMLElement).querySelector('mb-dialog')).toBeNull();
    expect(handoff).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/home'], { replaceUrl: true });
  });
});
