import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { compactContentLinks, compactUrlLabel, splitLinkedText } from './content-links';
import { LinkedText } from './linked-text';

describe('compact content links', () => {
  const url = 'https://example.com/' + 'a'.repeat(4096) + '?secret=kept#fragment';
  const label = 'example.com/' + 'a'.repeat(19) + '…';
  it('retains the host and twenty tail characters, with ellipsis only when needed', () => {
    expect(compactUrlLabel(url)).toBe(label);
    expect(compactUrlLabel('https://example.com/short?q=1#x')).toBe('example.com/short?q=1#x');
    expect(compactUrlLabel('https://example.com')).toBe('example.com');
    expect(compactUrlLabel('https://example.com/' + 'a'.repeat(19))).toBe(
      'example.com/' + 'a'.repeat(19),
    );
  });
  it.each(
    [
      `<a href="${url}">${url}</a>`,
      `<a href="${url}"><span class="invisible">https://</span><span class="ellipsis">example.com/aaa</span><span class="invisible">${'a'.repeat(4093)}</span></a>`,
      `<a href="${url}">example.com/aaa…</a>`,
      url,
    ].map((html, index) => ({ html, index })),
  )('normalizes provider URL markup and plain URLs: $index', ({ html }) => {
    const doc = new DOMParser().parseFromString(compactContentLinks(html), 'text/html');
    expect(doc.querySelector('a')?.textContent).toBe(label);
    expect(doc.querySelector('a')?.getAttribute('href')).toBe(url);
  });
  it('preserves authored labels, mentions, hashtags and code', () => {
    const html = `<a href="${url}">Read this article</a><a class="mention" href="${url}">@reader</a><a class="hashtag" href="${url}">#topic</a><code>${url}</code>`;
    expect(compactContentLinks(html)).toBe(html);
  });
  it('preserves surrounding punctuation and balanced parentheses', () => {
    expect(splitLinkedText('See (https://example.com/a(b)). Next.')).toEqual([
      { text: 'See (' },
      { text: 'example.com/a(b)', href: 'https://example.com/a(b)' },
      { text: '). Next.' },
    ]);
  });
  it('renders model text as text while making its shortened URL clickable', () => {
    const fixture = TestBed.createComponent(LinkedText);
    const text = `<img src=x onerror=alert(1)>\n${url}\n<script>alert(2)</script> javascript:alert(3)`;
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.querySelectorAll('a')).toHaveLength(1);
    expect(el.querySelector('a')?.getAttribute('href')).toBe(url);
    expect(el.querySelector('a')?.textContent).toBe(label);
    expect(el.textContent).toBe(text.replace(url, label));
  });
});
