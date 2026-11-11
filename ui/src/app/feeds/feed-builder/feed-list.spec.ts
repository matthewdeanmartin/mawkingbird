import { of, throwError } from 'rxjs';
import type { UserList } from '../../platform/api/models';
import { convertToList } from './feed-list';

function fakeApi(existing: UserList[] = [], rejects: string[] = []) {
  const members: string[] = [];
  const calls = { created: 0, updated: [] as boolean[], adds: 0 };
  const api = {
    lists: () => of(existing),
    createList: (title: string) => {
      calls.created++;
      return of({ id: 'new', title, exclusive: false } as UserList);
    },
    updateList: (list: UserList, exclusive: boolean) => {
      calls.updated.push(exclusive);
      return of({ ...list, exclusive });
    },
    addManyToList: (_id: string, ids: string[]) => {
      calls.adds++;
      if (ids.some((id) => rejects.includes(id))) return throwError(() => new Error('422'));
      members.push(...ids);
      return of({});
    },
  };
  return { api, members, calls };
}

describe('convertToList', () => {
  it('creates a list named after the topic, hides it from Home, and adds everyone', async () => {
    const { api, members, calls } = fakeApi();
    const result = await convertToList(api, 'Science fiction & fantasy', ['1', '2', '3'], true);
    expect(calls.created).toBe(1);
    expect(calls.updated).toEqual([true]);
    expect(result.list.exclusive).toBe(true);
    expect(result.added).toBe(3);
    expect(members).toEqual(['1', '2', '3']);
  });

  it('reuses a list of the same name and leaves its Home setting alone when it matches', async () => {
    const { api, calls } = fakeApi([
      { id: 'old', title: 'science fiction & fantasy ', exclusive: false },
    ]);
    const result = await convertToList(api, 'Science fiction & fantasy', ['1'], false);
    expect(result.list.id).toBe('old');
    expect(calls.created).toBe(0);
    expect(calls.updated).toEqual([]);
  });

  it('sends 50 accounts per request', async () => {
    const { api, calls } = fakeApi();
    const ids = Array.from({ length: 120 }, (_, index) => String(index));
    expect((await convertToList(api, 'SF', ids, false)).added).toBe(120);
    expect(calls.adds).toBe(3);
  });

  it('falls back to one by one when a batch fails, and counts only the accounts added', async () => {
    const { api, members } = fakeApi([], ['2']);
    const result = await convertToList(api, 'SF', ['1', '2', '3'], false);
    expect(result.added).toBe(2);
    expect(members).toEqual(['1', '3']);
  });
});
