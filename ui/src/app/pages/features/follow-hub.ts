import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { PUBLIC_KITS } from './follow-kits';

/**
 * `/follow/`: the public index of hand-picked starter kits, for people new to
 * Mastodon. Prerendered and served as-is in the browser, like `/features`.
 * Public English reference, independent of session, instance and dictionaries.
 */
@Component({
  selector: 'app-follow-hub',
  imports: [RouterLink, MbButton, MbContentLink],
  templateUrl: './follow-hub.html',
  styleUrls: ['./features.css', './follow.css'],
})
export class FollowHub {
  protected readonly kits = PUBLIC_KITS;
}
