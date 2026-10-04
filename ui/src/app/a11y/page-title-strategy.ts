import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { environment } from '../../environments/environment';
import { isCanaryBuild } from '../build-flavor';
import { Seo, SITE_ORIGIN } from '../seo';

/**
 * Sets the document title on every navigation.
 *
 * The tab title used to be set once at boot, so every route read as the bare
 * brand name. That is a mild annoyance with many tabs open and a real problem
 * for a screen reader: in a single-page app the title is often the only signal
 * that navigation happened at all, since nothing else about the document
 * changes identity. Angular's default strategy would do this already, but it
 * blanks the title on routes that declare none — of which this app has many —
 * so the fallback below is the reason for a custom one.
 *
 * Format is "Page · Brand": the specific part first, because screen readers
 * and narrow tab strips both truncate the end.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly seo = inject(Seo);

  /** Canary deployments announce themselves, matching the shell's brand. */
  private readonly brand = isCanaryBuild(
    new URL(inject(DOCUMENT).querySelector('base')?.getAttribute('href') ?? '/', SITE_ORIGIN).href,
  )
    ? 'Canary'
    : environment.brand;

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · ${this.brand}` : this.brand);
    this.seo.update(snapshot, this.title.getTitle());
  }
}
