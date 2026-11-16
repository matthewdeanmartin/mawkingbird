import { Component, computed, input, output } from '@angular/core';
import { Compose } from '../../publishing/compose/compose';
import { Status } from '../../platform/api/models';
import { BskyRef } from './bluesky-types';

@Component({
  selector: 'app-bsky-reply',
  imports: [Compose],
  template: `<app-compose
    [compact]="true"
    initialTarget="bsky"
    initialVisibility="public"
    [blueskyReplyTo]="ref()"
    (posted)="posted.emit($event)"
  />`,
  // A block, like the bare <app-compose> a Mastodon reply renders: an inline
  // host around the composer left its box laid out differently.
  styles: ':host { display: block; }',
})
export class BskyReply {
  readonly replyTo = input.required<Status>();
  readonly posted = output<Status>();
  protected ref = computed(() => this.replyTo().providerRef as BskyRef);
}
