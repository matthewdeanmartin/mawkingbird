import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { audienceContent } from './audience-content';

@Component({
  selector: 'app-audience-page',
  imports: [RouterLink, MbButton, MbContentLink],
  templateUrl: './audience-page.html',
  styleUrl: './features.css',
})
export class AudiencePage {
  readonly content = audienceContent[inject(ActivatedRoute).snapshot.data['audience']];
}
