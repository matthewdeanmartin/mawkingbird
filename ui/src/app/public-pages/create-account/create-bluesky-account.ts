import { isPlatformBrowser } from '@angular/common';
import { Component, inject, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { Auth } from '../../platform/session/auth';

/*
 * English only until the new-account feature settles (owner, 2026-11-18).
 * spec/bsky_parity.md § Sprint 2.
 */

/**
 * /create-bluesky-account/: a complete answer to "how do I create a Bluesky
 * account". There is one place to sign up, so unlike the Mastodon page there
 * is no server to choose: the button starts Bluesky's own sign-up form
 * (OAuth `prompt=create`) through the Bluesky sign-in page, which comes back
 * signed in and into setup. Someone already signed in adds an account.
 */
@Component({
  selector: 'app-create-bluesky-account',
  imports: [RouterLink, MbButton, MbContentLink],
  templateUrl: './create-bluesky-account.html',
  styleUrl: './create-account.css',
})
export class CreateBlueskyAccount {
  protected readonly signupParams =
    isPlatformBrowser(inject(PLATFORM_ID)) && inject(Auth).isAuthenticated
      ? { create: 1, add: 1 }
      : { create: 1 };
}
