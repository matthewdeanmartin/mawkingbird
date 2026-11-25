import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { audienceContent } from './audience-content';
import { AppOnlyLinkRel } from '../public-page-urls';

@Component({
  selector: 'app-audience-page',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink],
  templateUrl: './audience-page.html',
  styleUrl: './features.css',
})
export class AudiencePage {
  private readonly audience = inject(ActivatedRoute).snapshot.data['audience'];
  readonly content = audienceContent[this.audience];
  /** The front door, which suits every visitor; Unbird needs no account either. */
  readonly appRoute = this.audience === 'twitter-exodus' ? '/unbird' : '/';
}
