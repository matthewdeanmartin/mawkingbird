import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { MastodonAnalytics } from './mastodon-analytics';

describe('MastodonAnalytics', () => {
  beforeEach(() => localStorage.clear());

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [MastodonAnalytics],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(MastodonAnalytics);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, says what you will see and signs in back to this page', async () => {
    const root = await page({});
    expect(root.querySelectorAll('.steps li')).toHaveLength(3);
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fmastodon-analytics',
    );
  });

  it('signed in, shows the analytics instead of the pitch', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});
