import { Subscription } from 'rxjs';
import { Streaming, StreamEvent, StreamKind } from '../streaming';

/** A controllable fake of {@link Streaming}: tests push events to it by hand. */
export class FakeStreaming {
  private subscriber: ((ev: StreamEvent) => void) | null = null;
  closed = false;
  lastKind: StreamKind | null = null;
  openCount = 0;

  open(kind: StreamKind) {
    this.lastKind = kind;
    this.closed = false;
    this.openCount++;
    return {
      subscribe: (fn: (ev: StreamEvent) => void): Subscription => {
        this.subscriber = fn;
        return new Subscription(() => {
          this.closed = true;
          this.subscriber = null;
        });
      },
    } as unknown as ReturnType<Streaming['open']>;
  }

  emit(event: StreamEvent): void {
    this.subscriber?.(event);
  }
}
