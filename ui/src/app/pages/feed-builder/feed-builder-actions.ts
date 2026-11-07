import { Injector } from '@angular/core';
import { Api } from '../../api';
import { FollowState } from '../../follow-state';
import { FutureTagHints } from '../../future-tag-hints';
import { HomeTopics } from '../../home-topics';
import { ImportFollows } from '../../import-follows';

/**
 * The services a signed-in Builder follows with. Imported dynamically by the
 * page, and only in the shell's twin: the public page is prerendered without a
 * document, and this graph must never load there.
 */
export class FeedFollowActions {
  readonly api: Api;
  readonly topics: HomeTopics;
  readonly importer: ImportFollows;
  readonly hints: FutureTagHints;
  /** Who the reader follows, by their server's ids (shared with every Follow button). */
  readonly follows: FollowState;

  constructor(injector: Injector) {
    this.api = injector.get(Api);
    this.topics = injector.get(HomeTopics);
    this.importer = injector.get(ImportFollows);
    this.hints = injector.get(FutureTagHints);
    this.follows = injector.get(FollowState);
  }
}
