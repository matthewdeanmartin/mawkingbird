import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleMastodonPosts } from './schedule-mastodon-posts';

describe('ScheduleMastodonPosts', () => {
  beforeEach(() => localStorage.clear());

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [ScheduleMastodonPosts],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ScheduleMastodonPosts);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, explains server-side scheduling and signs in back to this page', async () => {
    const root = await page({});
    expect(root.querySelector('h1')?.textContent).toContain('Schedule Mastodon posts in advance');
    expect(root.querySelectorAll('.steps li')).toHaveLength(3);
    expect(root.textContent).toContain('Nothing waits in your browser');
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fschedule-mastodon-posts',
    );
    // The tool itself never renders signed out, so prerendering touches no account.
    expect(root.querySelector('app-schedule-workbench')).toBeNull();
  });

  it('signed in, shows the scheduler instead of the pitch', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});
