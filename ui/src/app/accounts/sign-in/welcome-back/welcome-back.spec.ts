import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeBack } from './welcome-back';

/**
 * Step one used to say "press Ctrl + D". On a phone there is no such key, and
 * `navigator.platform` reports `iPhone` — which fell through to the non-Mac
 * branch, so phone users were told to press a combination they do not have. It
 * is the first of two steps, so it stalled the whole sign-up on the device most
 * likely to be running it.
 */
describe('WelcomeBack keep-this-page step', () => {
  let matchMedia: typeof window.matchMedia;

  beforeEach(() => {
    matchMedia = window.matchMedia;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({ server: 'https://mastodon.art' }) },
            paramMap: of(convertToParamMap({})),
          },
        },
      ],
    });
  });

  afterEach(() => {
    window.matchMedia = matchMedia;
  });

  /** `coarse` is the question actually being asked: is there a keyboard here. */
  function render(pointer: 'coarse' | 'fine'): ComponentFixture<WelcomeBack> {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('pointer: coarse') && pointer === 'coarse',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const fixture = TestBed.createComponent(WelcomeBack);
    fixture.detectChanges();
    return fixture;
  }

  it('never names a keystroke on a touch device', () => {
    const text = (render('coarse').nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('Ctrl + D');
    expect(text).not.toContain('⌘ + D');
    // It still has to say something useful, or the step is just missing.
    expect(text).toContain('Keep this tab open');
  });

  it('keeps the keystroke where there is a keyboard to press it on', () => {
    const text = (render('fine').nativeElement as HTMLElement).textContent ?? '';

    expect(text).toMatch(/Ctrl \+ D|⌘ \+ D/);
  });
});
