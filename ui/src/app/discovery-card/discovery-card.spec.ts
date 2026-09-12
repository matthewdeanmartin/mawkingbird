import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientPrefs } from '../client-prefs';
import { DISCOVERY_WAYS } from '../discovery-ways';
import { DiscoveryCard } from './discovery-card';

describe('DiscoveryCard branding', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each([
    ['/', 'mockingbird_hand_104.png', 'mockigbird_logo_104.png'],
    ['/canary/', 'canary_hand_104.png', 'canary_logo_104.png'],
    ['/test/', 'canary_hand_104.png', 'canary_logo_104.png'],
  ])('uses the %s bird and reacts to art preference changes', (base, hand, ai) => {
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue(`https://mawkingbird.com${base}`);
    const fixture = TestBed.createComponent(DiscoveryCard);
    fixture.componentRef.setInput('way', DISCOVERY_WAYS[0]);
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setArtStyle('hand');
    fixture.detectChanges();
    const avatar = (fixture.nativeElement as HTMLElement).querySelector('img')!;
    expect(avatar.getAttribute('src')).toBe(hand);
    prefs.setArtStyle('ai');
    fixture.detectChanges();
    expect(avatar.getAttribute('src')).toBe(ai);
    prefs.setArtStyle('hand');
    fixture.detectChanges();
    expect(avatar.getAttribute('src')).toBe(hand);
  });
});
