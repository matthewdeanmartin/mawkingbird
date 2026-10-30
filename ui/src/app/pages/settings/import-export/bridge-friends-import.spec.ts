import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { BridgeFinder } from './bridge-finder';
import { BridgeFriendsImport } from './bridge-friends-import';
import { BridgeNetwork } from './bridge-matching';

describe('BridgeFriendsImport', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  function render(inputs: { fixedSource?: BridgeNetwork; connectInline?: boolean } = {}) {
    const fixture = TestBed.createComponent(BridgeFriendsImport);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('in Settings, offers both directions and links to where each account is connected', () => {
    const root = render();
    expect(root.querySelector('mb-radio-group')).not.toBeNull();
    expect(
      root.querySelector('.bridge-gate a[href="/settings/connections/bluesky"]'),
    ).not.toBeNull();
  });

  it("on a tool page, takes the URL's direction and hides the switch", () => {
    const finder = TestBed.inject(BridgeFinder);
    expect(finder.direction().source).toBe('mastodon');
    const root = render({ fixedSource: 'bluesky' });
    expect(finder.direction()).toEqual({ source: 'bluesky', target: 'mastodon' });
    expect(root.querySelector('mb-radio-group')).toBeNull();
  });

  it('leaves connecting to the host page when it renders the connectors itself', () => {
    const root = render({ fixedSource: 'mastodon', connectInline: true });
    expect(root.querySelector('.bridge-gate')).toBeNull();
    // Still disabled until both accounts are there.
    expect(root.querySelector<HTMLFieldSetElement>('fieldset.bridge-body')?.disabled).toBe(true);
  });
});
