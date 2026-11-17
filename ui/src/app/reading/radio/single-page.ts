import { Status } from '../../platform/api/models';
import { CATALOGUE_POST } from './catalogue-search';

/** Whether a post can open on the Listen page: not a catalogue item or a pasted link. */
export function postHasPage(post: Pick<Status, 'id'>): boolean {
  return !post.id.startsWith(CATALOGUE_POST) && !/^https?:/i.test(post.id);
}
