import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Compose } from '../publishing/compose/compose';

// i18n lite.write: Write

/**
 * The full app's composer, unchanged: drafts, the Outbox for posts written
 * offline, threads, content warnings and polls all come with it. Replies are
 * written on the post itself, as in the full app.
 */
@Component({
  selector: 'app-lite-compose',
  imports: [Compose, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.write' | transloco }}</h1>
    <div class="lite-compose">
      <app-compose draftContext="lite" (posted)="done()" />
    </div>`,
  styles: `
    .lite-compose {
      padding: 0 16px 16px;
    }
  `,
})
export class LiteCompose {
  private readonly router = inject(Router);

  protected done(): void {
    void this.router.navigateByUrl('/m/home');
  }
}
