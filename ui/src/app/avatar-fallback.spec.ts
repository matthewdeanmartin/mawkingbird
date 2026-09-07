import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AvatarFallback, initialsAvatar } from './avatar-fallback';

@Component({
  imports: [AvatarFallback],
  template: `<img
    src="https://files.mastodon.social/broken.png"
    [alt]="label"
    [appAvatarFallback]="label"
  />`,
})
class Host {
  label = 'Anna Mam';
}

function decode(src: string): string {
  return decodeURIComponent(src.replace('data:image/svg+xml,', ''));
}

describe('initialsAvatar', () => {
  it('takes the first and last initial of a multi-word name', () => {
    expect(decode(initialsAvatar('Anna Mam'))).toContain('>AM<');
  });

  it('takes a single initial from a one-word name', () => {
    expect(decode(initialsAvatar('mossy'))).toContain('>M<');
  });

  // A handle is the fallback label, and `user@host` must not become "U@" or
  // pick the domain's letter as the second initial.
  it('splits a handle on punctuation rather than on the domain', () => {
    expect(decode(initialsAvatar('ada.lovelace'))).toContain('>AL<');
  });

  it('is stable: the same label always gets the same colour', () => {
    expect(initialsAvatar('Anna Mam')).toBe(initialsAvatar('Anna Mam'));
  });

  it('gives different labels different colours', () => {
    // Not a guarantee for every pair (the palette is finite), but these two
    // differing is what makes a member list readable rather than one flat block.
    expect(initialsAvatar('Anna Mam')).not.toBe(initialsAvatar('Gargron'));
  });

  // An emoji as the first character of a display name is common on Mastodon, and
  // slicing a surrogate pair in half renders a replacement glyph.
  it('does not split a non-BMP first character', () => {
    expect(decode(initialsAvatar('🦋 Butterfly'))).not.toContain('�');
  });

  it('escapes the label so it cannot break out of the SVG', () => {
    const svg = decode(initialsAvatar('<script>'));
    expect(svg).not.toContain('<script>');
  });

  it('falls back to a question mark for an empty label', () => {
    expect(decode(initialsAvatar(''))).toContain('>?<');
  });
});

describe('AvatarFallback', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('leaves a working image alone', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;

    expect(img.getAttribute('src')).toContain('files.mastodon.social');
  });

  // The actual scenario: files.mastodon.social blocked, so every bundled
  // collection's avatars error at once.
  it('swaps in generated initials when the image fails to load', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;

    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(img.getAttribute('src')).toBe(initialsAvatar('Anna Mam'));
  });

  it('does not loop if the generated image somehow errors too', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;

    img.dispatchEvent(new Event('error'));
    const first = img.getAttribute('src');
    fixture.componentInstance.label = 'Someone Else';
    fixture.detectChanges();
    img.dispatchEvent(new Event('error'));

    expect(img.getAttribute('src')).toBe(first);
  });
});
