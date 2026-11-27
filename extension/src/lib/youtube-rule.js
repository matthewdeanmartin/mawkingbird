import { YOUTUBE_ORIGIN } from './bridge.js';

/**
 * The declarativeNetRequest rule that removes `Origin` from the extension's own
 * requests to YouTube's web-client API (it answers 403 to moz-extension://…).
 * Firefox applies it; the extension never sees request headers or cookies.
 *
 * - `tabIds: [-1]`: requests from no tab, i.e. the extension's own. The
 *   reader's YouTube tabs are never modified.
 * - Only `/youtubei/v1/` on www.youtube.com, only POST.
 * - With `declarativeNetRequestWithHostAccess` it applies only once the reader
 *   has allowed YouTube.
 */
export const YOUTUBE_ORIGIN_RULE_ID = 1;

export function youtubeOriginRule() {
  return {
    id: YOUTUBE_ORIGIN_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'origin', operation: 'remove' }],
    },
    condition: {
      urlFilter: `|${YOUTUBE_ORIGIN}/youtubei/v1/`,
      tabIds: [-1],
      requestMethods: ['post'],
      resourceTypes: ['xmlhttprequest', 'other'],
    },
  };
}
