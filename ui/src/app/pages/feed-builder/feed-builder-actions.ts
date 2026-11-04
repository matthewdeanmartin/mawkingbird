import { Injector } from '@angular/core';
import { Api } from '../../api';
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

  constructor(injector: Injector) {
    this.api = injector.get(Api);
    this.topics = injector.get(HomeTopics);
    this.importer = injector.get(ImportFollows);
  }
}
