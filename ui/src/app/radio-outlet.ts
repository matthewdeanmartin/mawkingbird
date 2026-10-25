import { Injectable, signal, Type } from '@angular/core';

/** The shell holds only a lazy component reference; Radio stays out of startup. */
@Injectable({ providedIn: 'root' })
export class RadioOutlet {
  readonly component = signal<Type<unknown> | null>(null);
}
