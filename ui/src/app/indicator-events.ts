import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface IndicatorEvent {
  did: string;
  id: string;
  lane: 'ordinary' | 'chat';
  at: string;
  unread: boolean;
  group?: string;
}

/** Observations from existing provider requests; subscribing never starts a request. */
@Injectable({ providedIn: 'root' })
export class IndicatorEvents {
  readonly received = new Subject<IndicatorEvent>();
}
