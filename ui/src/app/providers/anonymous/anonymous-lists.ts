import { computed, Injectable, signal } from '@angular/core';
import { UserList } from '../../models';

const STORAGE_KEY = 'mockingbird_anonymous_lists';
const STATE_VERSION = 2;

export interface AnonymousList extends UserList {
  memberKeys: string[];
}

interface AnonymousListState {
  version: typeof STATE_VERSION;
  lists: AnonymousList[];
}

function loadState(): AnonymousListState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<AnonymousListState> | null;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.lists)) {
      return { version: STATE_VERSION, lists: [] };
    }
    return {
      version: STATE_VERSION,
      lists: parsed.lists.filter(
        (list): list is AnonymousList =>
          typeof list?.id === 'string' &&
          typeof list.title === 'string' &&
          Array.isArray(list.memberKeys),
      ),
    };
  } catch {
    return { version: STATE_VERSION, lists: [] };
  }
}

/** Browser-local named groups of Anonymous Mastodon follow keys. */
@Injectable({ providedIn: 'root' })
export class AnonymousLists {
  private state = signal(loadState());

  readonly lists = computed(() => this.state().lists);

  get(id: string): AnonymousList | null {
    return this.lists().find((list) => list.id === id) ?? null;
  }

  create(title: string): AnonymousList {
    const list: AnonymousList = {
      id: `anonymous-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      memberKeys: [],
    };
    this.persist([...this.lists(), list]);
    return list;
  }

  remove(id: string): void {
    this.persist(this.lists().filter((list) => list.id !== id));
  }

  hasMember(id: string, followKey: string): boolean {
    return this.get(id)?.memberKeys.includes(followKey) ?? false;
  }

  setMember(id: string, followKey: string, member: boolean): void {
    this.persist(
      this.lists().map((list) => {
        if (list.id !== id) return list;
        const keys = new Set(list.memberKeys);
        if (member) keys.add(followKey);
        else keys.delete(followKey);
        return { ...list, memberKeys: [...keys] };
      }),
    );
  }

  private persist(lists: AnonymousList[]): void {
    const state: AnonymousListState = { version: STATE_VERSION, lists };
    this.state.set(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}
