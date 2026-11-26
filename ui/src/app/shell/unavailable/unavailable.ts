import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';

// i18n unavailable.title: Sign in to open this page
// i18n unavailable.body: It needs a signed-in account: {{feature}}. After signing in you come back here.
// i18n unavailable.signIn: Sign in
// i18n unavailable.home: Back to Home

/** Friendly destination for features that require an authenticated identity. */
@Component({
  selector: 'app-unavailable',
  imports: [MbButton, RouterLink, TranslocoPipe],
  template: `
    <section class="unavailable">
      <h1>{{ 'unavailable.title' | transloco }}</h1>
      <p class="muted">{{ 'unavailable.body' | transloco: { feature: feature() } }}</p>
      <p class="actions">
        <a mbButton routerLink="/login" [queryParams]="signIn()">{{
          'unavailable.signIn' | transloco
        }}</a>
        <a mbButton variant="outline" routerLink="/home">{{ 'unavailable.home' | transloco }}</a>
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .unavailable {
      padding: 48px 32px;
      text-align: center;
    }
    .unavailable h1 {
      margin-bottom: 8px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 16px;
    }
  `,
})
export class Unavailable {
  private route = inject(ActivatedRoute);
  protected feature = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('feature') ?? 'This feature')),
    { initialValue: 'This feature' },
  );
  /** The page that turned the reader away, checked again by the sign-in page. */
  protected signIn = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => {
        const next = params.get('next');
        return next ? { next } : {};
      }),
    ),
    { initialValue: {} },
  );
}
