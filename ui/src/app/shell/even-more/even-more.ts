import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { OnboardingLauncher } from '../../accounts/onboarding/onboarding-launcher';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { FeatureFlags } from '../../platform/build/feature-flags';
import { Auth } from '../../platform/session/auth';
import { DiscoveryWindow } from '../../wellness/discovery-window';
import { ScreenShare } from '../screen-share/screen-share';
import { EVEN_MORE_SECTIONS, EvenMoreLink } from './even-more-links';

// i18n evenMore.title: Even more
// i18n evenMore.close: Close
// i18n evenMore.lede: Things used now and then, and direct links to pages that live a few steps down.
// i18n evenMore.tools: Tools

/**
 * "Even more" (spec/sprint/explore-2026-11.md, Sprint 5): one row in the `…`
 * menu opens this flat dialog. On top, the tools the owner uses and ordinary
 * readers rarely do (screen share mode, Observability, onboarding again);
 * below, sections of direct links from {@link EVEN_MORE_SECTIONS}.
 *
 * Every control closes the dialog: each one either navigates or changes the
 * whole screen (screen share, the onboarding card).
 */
@Component({
  selector: 'app-even-more',
  imports: [MbButton, MbDialog, RouterLink, TranslocoPipe],
  template: `
    <mb-dialog
      [title]="'evenMore.title' | transloco"
      [description]="'evenMore.lede' | transloco"
      [closeLabel]="'evenMore.close' | transloco"
      [closeOnBackdrop]="true"
      [returnFocusTo]="returnFocusTo()"
      (dismissed)="closed.emit()"
    >
      <section class="em-section">
        <h3>{{ 'evenMore.tools' | transloco }}</h3>
        <div class="em-tools">
          <button
            mbButton
            variant="outline"
            size="small"
            type="button"
            (click)="toggleScreenShare()"
          >
            {{
              (screenShare.enabled() ? 'shell.menu.screenShareOff' : 'shell.menu.screenShareOn')
                | transloco
            }}
          </button>
          <button mbButton variant="outline" size="small" type="button" (click)="openOnboarding()">
            {{ 'shell.menu.onboarding' | transloco }}
          </button>
          <a
            mbButton
            variant="outline"
            size="small"
            routerLink="/observability"
            (click)="closed.emit()"
          >
            {{ 'shell.menu.observability' | transloco }}
          </a>
        </div>
      </section>
      @for (section of sections(); track section.id) {
        <section class="em-section">
          <h3>{{ section.titleKey | transloco }}</h3>
          <ul class="em-links">
            @for (item of section.links; track item.id) {
              <li>
                <a
                  [routerLink]="item.link"
                  [queryParams]="item.queryParams"
                  (click)="closed.emit()"
                  >{{ item.labelKey | transloco }}</a
                >
              </li>
            }
          </ul>
        </section>
      }
    </mb-dialog>
  `,
  styles: `
    .em-section + .em-section {
      margin-top: 1rem;
    }
    h3 {
      font-size: 0.95rem;
      margin: 0 0 0.4rem;
    }
    .em-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .em-links {
      columns: 2 12rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .em-links li {
      break-inside: avoid;
      padding: 0.2rem 0;
    }
  `,
})
export class EvenMore {
  readonly returnFocusTo = input<HTMLElement | null>(null);
  readonly closed = output<void>();

  protected readonly screenShare = inject(ScreenShare);
  private readonly onboarding = inject(OnboardingLauncher);
  private readonly flags = inject(FeatureFlags);
  private readonly auth = inject(Auth);
  private readonly discovery = inject(DiscoveryWindow);

  /** Sections with only the links that work here; an emptied section is dropped. */
  protected readonly sections = computed(() =>
    EVEN_MORE_SECTIONS.map((section) => ({
      ...section,
      links: section.links.filter((item) => this.offered(item)),
    })).filter((section) => section.links.length),
  );

  private offered(item: EvenMoreLink): boolean {
    if (item.flag && !this.flags.enabled(item.flag)) return false;
    if (item.discovery && !this.discovery.open()) return false;
    if (item.requires === 'signedIn' && this.auth.isAnonymous) return false;
    if (item.requires === 'mastodon' && (this.auth.isAnonymous || this.auth.lacksMastodonToken)) {
      return false;
    }
    return true;
  }

  protected toggleScreenShare(): void {
    this.screenShare.set(!this.screenShare.enabled());
    this.closed.emit();
  }

  protected openOnboarding(): void {
    this.closed.emit();
    this.onboarding.openFromMenu();
  }
}
