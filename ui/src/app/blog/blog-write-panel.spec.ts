import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { BlogWritePanel } from './blog-write-panel';

describe('BlogWritePanel', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  async function render(body: string, parts: string[]) {
    const fixture = TestBed.createComponent(BlogWritePanel);
    fixture.componentRef.setInput('body', body);
    fixture.componentRef.setInput('parts', parts);
    const emitted: string[] = [];
    fixture.componentInstance.bodyChange.subscribe((value) => emitted.push(value));
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, emitted };
  }

  it('edits the first line as the title', async () => {
    const { el, emitted } = await render('Old\nBody', ['Old\nBody']);
    const title = el.querySelector<HTMLInputElement>('input[name="blog_title"]')!;
    expect(title.value).toBe('Old');
    title.value = 'New';
    title.dispatchEvent(new Event('input'));
    expect(emitted).toEqual(['New\nBody']);
  });

  it('toggles the BLOG: mark and says why it counts', async () => {
    const { el, emitted } = await render('Hi\nthere', ['Hi\nthere']);
    expect(el.textContent).toContain('Not a blog post yet');
    const box = el.querySelector<HTMLInputElement>('input[name="blog_marked"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(emitted).toEqual(['BLOG: Hi\nthere']);

    const storm = await render('A\n---\nB\n---\nC', ['A', 'B', 'C']);
    expect(storm.el.textContent).toContain('a storm of 3 posts');
  });
});
