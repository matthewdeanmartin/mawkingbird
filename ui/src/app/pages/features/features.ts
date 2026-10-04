import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, inject, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MbNavigation, MbNavLink } from '../../design-system/navigation/navigation';

/** Public English reference; independent of session, instance and runtime dictionaries. */
@Component({
  selector: 'app-features',
  imports: [RouterLink, MbButton, MbContentLink, MbNavigation, MbNavLink],
  templateUrl: './features.html',
  styleUrl: './features.css',
})
export class Features {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Resolve against this document, rather than the app's root base tag. */
  protected sectionHref(fragment: string): string {
    const pathname = this.browser ? this.document.location.pathname : '/features/';
    return `${pathname}#${fragment}`;
  }
}
