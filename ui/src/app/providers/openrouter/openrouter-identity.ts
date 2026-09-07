import { Account } from '../../models';

/**
 * OpenRouter's synthetic identity — an {@link Account} with no posts.
 *
 * Modelled on `eliza-identity.ts` and using the same trick: the reserved
 * `openrouter:` id namespace can never collide with a real Mastodon id (those
 * are numeric strings), so the interception layers recognise an
 * OpenRouter-directed call with a cheap prefix test.
 *
 * The difference from Eliza is the timeline. Eliza has synthetic posts because
 * she is a character with things to say; a language model has nothing to say
 * unprompted, and inventing a feed of model-authored posts would be putting
 * words in the mouth of something that has not been asked a question. So the
 * profile exists purely as the door to a conversation — a correspondent, not an
 * author.
 */

/** Reserved id prefix. Any id under this namespace is OpenRouter's. */
export const OPENROUTER_NS = 'openrouter:';

export const OPENROUTER_ID = 'openrouter:self';

export const OPENROUTER_ACCT = 'openrouter';

/**
 * Deliberately on `mockingbird.com`, which is not a Mastodon instance and never
 * will be, so qualifying this handle can never resolve to a real account
 * somewhere that happens to be called openrouter.
 */
export const OPENROUTER_HANDLE = 'openrouter@mockingbird.com';

/** The conversation-store peer key. Matches the account id's local part. */
export const OPENROUTER_PEER = 'openrouter';

export function isOpenRouterId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(OPENROUTER_NS);
}

const BIO =
  'Whichever model you have chosen, reachable from your own OpenRouter key. ' +
  'Conversations stay in this browser — nothing is posted, and nobody else can see them.';

/**
 * OpenRouter's account.
 *
 * `statuses_count: 0` is the honest value and the profile page renders the
 * empty state from it. `bot: true` is what puts it behind the Bots chat filter.
 *
 * @param modelLabel The model currently selected, shown as the display name so
 *   the profile says what you are actually talking to rather than the brand of
 *   the router in front of it.
 */
export function openRouterAccount(modelLabel?: string | null): Account {
  return {
    id: OPENROUTER_ID,
    username: OPENROUTER_ACCT,
    acct: OPENROUTER_HANDLE,
    display_name: modelLabel ? `OpenRouter · ${modelLabel}` : 'OpenRouter',
    note: `<p>${BIO}</p>`,
    url: '',
    avatar: 'openrouter-avatar.svg',
    avatar_static: 'openrouter-avatar.svg',
    header: '',
    header_static: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: true,
    locked: false,
    discoverable: false,
    fields: [],
    role: null,
    source: {
      privacy: 'direct',
      sensitive: false,
      language: 'en',
      note: BIO,
      fields: [],
    },
  };
}
