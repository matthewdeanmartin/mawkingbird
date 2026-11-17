import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { BlogPrefs } from '../../blog/blog-prefs';
import { SettingsBlog } from './settings-blog';

describe('SettingsBlog', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  async function render() {
    const fixture = TestBed.createComponent(SettingsBlog);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function change(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('change'));
  }

  it('states the rule with the current numbers', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('at least 3 posts');
    expect(el.textContent).toContain('at least 1250 characters');
    expect(el.textContent).toContain('BLOG:');
    expect(el.textContent).toContain('content warning is never used as a title');
  });

  it('saves edited thresholds, clamped, and resets them', async () => {
    const { fixture, el } = await render();
    const prefs = TestBed.inject(BlogPrefs);
    const reset = el.querySelector<HTMLButtonElement>('button')!;
    expect(reset.disabled).toBe(true);

    change(el.querySelector<HTMLInputElement>('input[name="blog_min_posts"]')!, '5');
    change(el.querySelector<HTMLInputElement>('input[name="blog_min_chars"]')!, '10');
    await fixture.whenStable();
    expect(prefs.thresholds()).toEqual({ minPosts: 5, minChars: 100 });
    expect(el.textContent).toContain('at least 5 posts');
    expect(reset.disabled).toBe(false);

    reset.click();
    await fixture.whenStable();
    expect(prefs.isDefault()).toBe(true);
  });

  it('ignores an emptied field', async () => {
    const { el } = await render();
    change(el.querySelector<HTMLInputElement>('input[name="blog_min_posts"]')!, '');
    expect(TestBed.inject(BlogPrefs).thresholds().minPosts).toBe(3);
  });
});
