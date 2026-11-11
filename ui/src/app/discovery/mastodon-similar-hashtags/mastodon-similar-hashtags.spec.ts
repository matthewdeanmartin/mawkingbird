import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  ParamMap,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { HashtagSamples } from '../similar-hashtags/similar-hashtags';
import { MastodonSimilarHashtags } from './mastodon-similar-hashtags';
import { SimilarHashtagsWorkbench } from './similar-hashtags-workbench';

describe('MastodonSimilarHashtags', () => {
  async function render(inShell: boolean): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [MastodonSimilarHashtags],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { inShell } },
            queryParamMap: of(convertToParamMap({})),
          },
        },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(MastodonSimilarHashtags);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('works without an account and offers a sign-in that returns to the tool', async () => {
    const root = await render(false);
    expect(root.querySelector('h1')?.textContent).toContain('Similar hashtags on Mastodon');
    expect(root.textContent).toContain('No account needed');
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fmastodon-similar-hashtags',
    );
  });

  it('drops its own header and sign-in inside the signed-in shell', async () => {
    const root = await render(true);
    expect(root.querySelector('header')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});

describe('SimilarHashtagsWorkbench', () => {
  function setUp(tags?: string) {
    const params = new BehaviorSubject<ParamMap>(convertToParamMap(tags ? { tags } : {}));
    const page = vi.fn(() => of([]));
    TestBed.configureTestingModule({
      imports: [SimilarHashtagsWorkbench],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params.asObservable() } },
        { provide: HashtagSamples, useValue: { host: () => 'mastodon.social', page } },
        { provide: Auth, useValue: { kind: signal('anonymous'), token: signal(null) } },
      ],
    });
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockImplementation((_commands, extras) => {
        params.next(convertToParamMap((extras?.queryParams ?? {}) as Record<string, string>));
        return Promise.resolve(true);
      });
    const fixture = TestBed.createComponent(SimilarHashtagsWorkbench);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, page, navigate };
  }

  it('turns the typed hashtags into ?tags= and compares them as one set', () => {
    const { fixture, root, page, navigate } = setUp();
    expect(root.querySelector('app-similar-hashtags-panel')).toBeNull();
    (fixture.componentInstance as unknown as { text: { set(v: string): void } }).text.set(
      '#dog #Dogs, #DOG',
    );
    fixture.detectChanges();
    root.querySelector<HTMLFormElement>('form.finder')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { tags: 'dog,Dogs' } }),
    );
    expect(root.querySelector('app-similar-hashtags-panel')).not.toBeNull();
    expect(page).toHaveBeenCalledWith(['dog', 'Dogs'], undefined);
  });

  it('opens on the hashtags named in the URL, with the box filled in', async () => {
    const { fixture, root, page } = setUp('cats,caturday');
    await fixture.whenStable();
    expect(root.querySelector<HTMLInputElement>('input[name=tags]')!.value).toBe('#cats #caturday');
    expect(page).toHaveBeenCalledWith(['cats', 'caturday'], undefined);
  });
});
