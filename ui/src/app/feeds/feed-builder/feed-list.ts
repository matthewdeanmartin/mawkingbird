import { firstValueFrom } from 'rxjs';
import type { Api } from '../../platform/api/api';
import type { UserList } from '../../platform/api/models';

/** Accounts per list-membership request, as in the forum's list dialog. */
const ADD_BATCH = 50;

export interface ListResult {
  list: UserList;
  added: number;
}

/**
 * "Convert to list": put the people the reader just followed into a Mastodon
 * list named after the topic, and optionally hide them from Home (`exclusive`).
 * Lists hold only followed accounts, so this runs after the follow batch, with
 * the ids the importer resolved on the reader's own server. Running it again
 * reuses the list of the same name instead of making a second one.
 */
export async function convertToList(
  api: Pick<Api, 'lists' | 'createList' | 'updateList' | 'addManyToList'>,
  title: string,
  accountIds: readonly string[],
  exclusive: boolean,
): Promise<ListResult> {
  const lists = await firstValueFrom(api.lists());
  let list =
    lists.find((each) => each.title.trim().toLowerCase() === title.trim().toLowerCase()) ??
    (await firstValueFrom(api.createList(title)));
  if (!!list.exclusive !== exclusive) {
    list = await firstValueFrom(api.updateList(list, exclusive));
  }
  let added = 0;
  for (let index = 0; index < accountIds.length; index += ADD_BATCH) {
    const batch = accountIds.slice(index, index + ADD_BATCH);
    try {
      await firstValueFrom(api.addManyToList(list.id, batch));
      added += batch.length;
    } catch {
      // One member already in the list, or a follow still pending approval,
      // fails the whole batch; go one by one.
      for (const id of batch) {
        try {
          await firstValueFrom(api.addManyToList(list.id, [id]));
          added++;
        } catch {
          // Already there, or not followed (yet): nothing to add.
        }
      }
    }
  }
  return { list, added };
}
