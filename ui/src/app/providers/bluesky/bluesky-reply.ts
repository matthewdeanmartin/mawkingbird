import { Component, computed, input, output } from '@angular/core';
import { Compose } from '../../compose/compose';
import { Status } from '../../models';
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
})
export class BskyReply {
  readonly replyTo = input.required<Status>();
  readonly posted = output<Status>();
  protected ref = computed(() => this.replyTo().providerRef as BskyRef);
}
