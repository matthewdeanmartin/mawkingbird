import { Injectable } from '@angular/core';
import { ReplaySubject } from 'rxjs';
import { Status } from './models';

/** Shares each freshly loaded home-timeline page with timeline-derived widgets. */
@Injectable({ providedIn: 'root' })
export class HomeTimelineFeed {
  readonly loaded = new ReplaySubject<Status[]>(1);

  publish(statuses: Status[]): void {
    this.loaded.next(statuses);
  }
}
