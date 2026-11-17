import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogsLanding } from './blogs-landing';
import { BlogSource } from './blog-source';

describe('BlogsLanding', () => {
  const source = { ownHandle: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: BlogSource, useValue: source }],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(BlogsLanding);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('offers My blog only with a Mastodon session', async () => {
    source.ownHandle.mockReturnValue(null);
    expect((await render()).el.textContent).not.toContain('My blog');
    source.ownHandle.mockReturnValue('me@home.example');
    const { el } = await render();
    expect(el.querySelector('a[href="/blogs/me"]')).not.toBeNull();
  });

  it('states the current rule', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('a storm of 3 or more posts');
    expect(el.textContent).toContain('1250 or more characters');
  });

  it('opens a full handle and rejects a bare one', async () => {
    const { fixture, el } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const input = el.querySelector<HTMLInputElement>('input[name="blog_handle"]')!;
    const form = el.querySelector('form')!;

    input.value = '@alice';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(navigate).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Use the full handle');

    input.value = 'Alice@Far.Example';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/blogs', '@Alice@far.example']);
  });
});
