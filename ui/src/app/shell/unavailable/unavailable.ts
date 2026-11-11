import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

/** Friendly destination for features that require an authenticated identity. */
@Component({
  selector: 'app-unavailable',
  imports: [RouterLink],
  template: `
    <section class="unavailable">
      <h1>{{ feature() }} isn't available anonymously</h1>
      <p class="muted">
        Anonymous uses public Mastodon data and local browser storage, so this feature needs a
        signed-in account or a later local implementation.
      </p>
      <a class="btn" routerLink="/home">Back to Home</a>
    </section>
  `,
  styles: `
    .unavailable {
      padding: 48px 32px;
      text-align: center;
    }
    .unavailable h1 {
      margin-bottom: 8px;
    }
    .unavailable .btn {
      display: inline-block;
      margin-top: 16px;
      text-decoration: none;
    }
  `,
})
export class Unavailable {
  private route = inject(ActivatedRoute);
  protected feature = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('feature') ?? 'This feature')),
    { initialValue: 'This feature' },
  );
}
