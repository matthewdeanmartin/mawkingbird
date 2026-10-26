import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { PUBLIC_KITS, publicKit } from './follow-kits';

/**
 * `/follow/<slug>/`: one hand-picked starter kit as a public page. The people
 * listed passed the search-listing consent rule in follow-kits.ts. Following
 * happens in the app (`/collections/starter/<slug>`), which also works for a
 * visitor without an account.
 */
@Component({
  selector: 'app-follow-kit',
  imports: [RouterLink, MbButton, MbContentLink, DecimalPipe],
  templateUrl: './follow-kit.html',
  styleUrls: ['./features.css', './follow.css'],
})
export class FollowKit {
  protected readonly kit = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => publicKit(params.get('slug')))),
    { initialValue: null },
  );
  protected readonly kits = PUBLIC_KITS;
}
