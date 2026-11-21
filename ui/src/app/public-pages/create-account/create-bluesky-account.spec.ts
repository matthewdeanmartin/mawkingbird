import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { CreateBlueskyAccount } from './create-bluesky-account';

describe('create-bluesky-account page', () => {
  function render(signedIn: boolean): HTMLElement {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: { isAuthenticated: signedIn } }],
    });
    const fixture = TestBed.createComponent(CreateBlueskyAccount);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const signupHref = (el: HTMLElement) =>
    [...el.querySelectorAll('a')]
      .find((a) => a.textContent?.includes('Create a Bluesky account'))
      ?.getAttribute('href');

  it('starts Bluesky’s own sign-up through the Bluesky sign-in page', () => {
    const el = render(false);
    expect(el.querySelector('h1')?.textContent).toBe('Create a Bluesky account');
    expect(signupHref(el)).toBe('/login/bluesky?create=1');
  });

  it('adds an account for someone already signed in', () => {
    expect(signupHref(render(true))).toBe('/login/bluesky?create=1&add=1');
  });

  it('prerenders the public signup link without initializing a browser session', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    TestBed.overrideProvider(Auth, {
      useFactory: () => {
        throw new Error('Prerendering tried to initialize Auth');
      },
    });
    expect(signupHref(render(false))).toBe('/login/bluesky?create=1');
  });
});
