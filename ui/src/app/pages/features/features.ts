import { Component } from '@angular/core';
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
export class Features {}
