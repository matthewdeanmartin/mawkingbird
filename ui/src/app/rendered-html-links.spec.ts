import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashtagNameFrom, mastodonProfileHandle, RenderedHtmlLinks } from './rendered-html-links';

@Component({
  imports: [RenderedHtmlLinks],
  template: `<div appRenderedHtmlLinks [innerHTML]="html"></div>`,
})
class Host {
  html = '';
}

describe('RenderedHtmlLinks', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  // `window.open` is a real global, so a spy on it outlives the test that
  // installed it — and so does its call log. Without this, a later test
  // asserting "open was not called" reads the *earlier* test's call and fails
  // while describing a URL it never mentions.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function render(html: string) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.html = html;
    fixture.detectChanges();
    return fixture;
  }

  // A bio's hashtag is an absolute URL to the origin instance. Following it left
  // Mawkingbird entirely and dropped the reader on a stranger's web UI.
  it('routes an origin-instance hashtag to the in-app tag page', () => {
    const fixture = render(
      '<a href="https://mastodon.social/tags/angular" class="hashtag">#angular</a>',
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const anchor = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(navigate).toHaveBeenCalledWith(['/tags', 'angular']);
    expect(event.defaultPrevented).toBe(true);
  });

  it('recognises a hashtag with no class, by its /tags/ path', () => {
    const fixture = render('<a href="https://example.social/tags/books">#books</a>');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('a') as HTMLAnchorElement).click();

    expect(navigate).toHaveBeenCalledWith(['/tags', 'books']);
  });

  it('opens an ordinary external link in a new tab instead of navigating away', () => {
    const fixture = render('<a href="https://example.com/post">a link</a>');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('a') as HTMLAnchorElement).click();

    expect(open).toHaveBeenCalledWith('https://example.com/post', '_blank', 'noopener,noreferrer');
    expect(navigate).not.toHaveBeenCalled();
  });

  // "My other account: https://mas.to/@me" is half of what bios are made of.
  // Following one used to leave the app for a server the reader is signed out
  // of, where they cannot follow anybody.
  it('routes a pasted profile link to the in-app profile', () => {
    const fixture = render('<a href="https://mas.to/@SoNotNic">SoNotNic</a>');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const anchor = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(navigate).toHaveBeenCalledWith(['/accounts', '@SoNotNic@mas.to']);
    expect(open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('routes the /users/ profile form too', () => {
    const fixture = render('<a href="https://example.social/users/alice">alice</a>');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('a') as HTMLAnchorElement).click();

    expect(navigate).toHaveBeenCalledWith(['/accounts', '@alice@example.social']);
  });

  // The trap this guards: a status URL starts with the same /@user prefix.
  // Matching it would answer "show me this post" with somebody's profile.
  it('leaves a link to a post alone', () => {
    const fixture = render('<a href="https://mas.to/@SoNotNic/109995">a post</a>');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('a') as HTMLAnchorElement).click();

    expect(navigate).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      'https://mas.to/@SoNotNic/109995',
      '_blank',
      expect.any(String),
    );
  });

  it('leaves clicks that missed a link alone', () => {
    const fixture = render('<p>just text</p>');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('p') as HTMLElement).click();

    expect(navigate).not.toHaveBeenCalled();
  });

  describe('mastodonProfileHandle', () => {
    it.each([
      ['https://mas.to/@SoNotNic', 'SoNotNic@mas.to'],
      ['https://mas.to/@SoNotNic/', 'SoNotNic@mas.to'],
      ['https://example.social/users/alice', 'alice@example.social'],
      // The host is lowercased because it is a hostname; the username is not,
      // because on Mastodon it is displayed as the account wrote it.
      ['https://MAS.TO/@SoNotNic', 'SoNotNic@mas.to'],
      ['https://mas.to/@first.last_1-2', 'first.last_1-2@mas.to'],
    ])('reads %s as %s', (url, expected) => {
      expect(mastodonProfileHandle(url)).toBe(expected);
    });

    it.each([
      // A status, not a profile.
      'https://mas.to/@SoNotNic/109995',
      // Deep links into things this app does not model.
      'https://mas.to/@SoNotNic?utm_source=x',
      'https://mas.to/@SoNotNic#bio',
      // Not a profile shape at all.
      'https://example.com/blog/post',
      'https://mas.to/tags/angular',
      'https://mas.to/',
      // Not even a URL, and not a web scheme.
      'javascript:alert(1)',
      'mailto:someone@example.com',
      'not a url',
    ])('declines %s', (url) => {
      expect(mastodonProfileHandle(url)).toBeNull();
    });
  });

  describe('hashtagNameFrom', () => {
    function anchorFor(html: string): HTMLAnchorElement {
      const host = document.createElement('div');
      host.innerHTML = html;
      return host.querySelector('a')!;
    }

    it('decodes a percent-encoded tag', () => {
      const a = anchorFor('<a href="https://x.social/tags/caf%C3%A9" class="hashtag">#café</a>');
      expect(hashtagNameFrom(a, a.getAttribute('href')!)).toBe('café');
    });

    it('falls back to the visible text when the href has no tag segment', () => {
      const a = anchorFor('<a href="https://x.social/whatever" class="hashtag">#fallback</a>');
      expect(hashtagNameFrom(a, a.getAttribute('href')!)).toBe('fallback');
    });

    it('returns null for a link that is not a hashtag at all', () => {
      const a = anchorFor('<a href="https://example.com/">homepage</a>');
      expect(hashtagNameFrom(a, a.getAttribute('href')!)).toBeNull();
    });
  });
});
