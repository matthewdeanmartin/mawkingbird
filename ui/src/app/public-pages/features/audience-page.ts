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
  readonly content = audienceContent[inject(ActivatedRoute).snapshot.data['audience']];
}
