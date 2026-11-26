import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../platform/session/auth';

const DOMAIN = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

/**
 * /create-mastodon-account/go/<server>: a counted hop (GoatCounter records the
 * path, so the chosen server shows in the funnel) to the sign-in page, which
 * checks the server and starts the sign-up (`go=1`). Someone already signed in
 * adds an account instead of being sent Home.
 */
@Component({
  selector: 'app-create-account-go',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
export class CreateAccountGo {
  constructor() {
    const server = inject(ActivatedRoute).snapshot.paramMap.get('server') ?? '';
    const router = inject(Router);
    const signedIn = inject(Auth).isAuthenticated;
    if (!DOMAIN.test(server)) {
      void router.navigateByUrl('/create-mastodon-account', { replaceUrl: true });
      return;
    }
    void router.navigate(['/login/mastodon'], {
      queryParams: { intent: 'need', server, go: 1, ...(signedIn && { add: 1 }) },
      replaceUrl: true,
    });
  }
}
