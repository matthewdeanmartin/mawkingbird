import { Injectable, signal } from '@angular/core';
import { PASTE_SERVICES } from '../publishing-services';

const STORAGE_KEY = 'mockingbird_paste_service';

function load(): string {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return PASTE_SERVICES.some((item) => item.id === value) ? value! : 'rentry';
  } catch {
    return 'rentry';
  }
}

/** Default for new compositions; existing drafts retain their provider. */
@Injectable({ providedIn: 'root' })
export class PasteSettings {
  readonly selected = signal(load());

  select(id: string): boolean {
    if (!PASTE_SERVICES.some((item) => item.id === id)) return false;
    try {
      localStorage.setItem(STORAGE_KEY, id);
      this.selected.set(id);
      return true;
    } catch {
      return false;
    }
  }
}
