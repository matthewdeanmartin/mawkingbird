import { Injectable, signal } from '@angular/core';
import { accountScopeSuffix } from '../../account-scope';
import { RadioSource } from './radio-player';

const KEY = 'mockingbird_radio_searches';
const LIMIT = 50;

/** A Radio search to repeat: where to look, and whether only native audio counts. */
export interface SavedRadioSearch {
  id: string;
  name: string;
  source: RadioSource;
  /** The account handle, list id or hashtag, depending on the source. */
  value: string;
  nativeOnly: boolean;
}

function valid(item: unknown): item is SavedRadioSearch {
  const row = item as Partial<SavedRadioSearch> | null;
  return (
    typeof row?.id === 'string' &&
    typeof row.name === 'string' &&
    ['account', 'home', 'list', 'tag'].includes(row.source ?? '') &&
    typeof row.value === 'string' &&
    typeof row.nativeOnly === 'boolean'
  );
}

/** Saved Radio searches, per account, offered as sources in the Search tab. */
@Injectable({ providedIn: 'root' })
export class RadioSearches {
  readonly saved = signal<SavedRadioSearch[]>([]);
  readonly error = signal(false);

  refresh(): void {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(KEY + accountScopeSuffix()) ?? '[]');
      this.saved.set(Array.isArray(data) ? data.filter(valid).slice(0, LIMIT) : []);
      this.error.set(false);
    } catch {
      this.saved.set([]);
    }
  }

  /** Save a search; the same source and value replaces the earlier one. */
  save(search: Omit<SavedRadioSearch, 'id'>): SavedRadioSearch | null {
    this.refresh();
    const name = search.name.trim().slice(0, 100);
    if (!name) return null;
    const same = this.saved().find(
      (row) => row.source === search.source && row.value === search.value,
    );
    const row: SavedRadioSearch = { ...search, name, id: same?.id ?? crypto.randomUUID() };
    const rows = same
      ? this.saved().map((item) => (item.id === row.id ? row : item))
      : [...this.saved(), row].slice(-LIMIT);
    return this.write(rows) ? row : null;
  }

  remove(id: string): void {
    this.refresh();
    this.write(this.saved().filter((row) => row.id !== id));
  }

  private write(rows: SavedRadioSearch[]): boolean {
    try {
      localStorage.setItem(KEY + accountScopeSuffix(), JSON.stringify(rows));
      this.saved.set(rows);
      this.error.set(false);
      return true;
    } catch {
      this.error.set(true);
      return false;
    }
  }
}
