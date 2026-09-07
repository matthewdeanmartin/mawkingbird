import { Account, MastodonNotification, Relationship, Status } from '../models';

/** Python routes/accounts.py is the reference, not Lite's sticky everMutual flag.
 * Interaction evidence is a bounded client approximation of Python's cached DB.
 * These are overlapping views, not mutually exclusive buckets.
 */
export const PEOPLE_CATEGORIES = [
  'top_friends',
  'mutuals',
  'readers',
  'idols',
  'parasocials',
  'bots',
  'chatty',
  'broadcasters',
  'lively',
  'graveyard',
  'other',
] as const;
export type PeopleCategory = (typeof PEOPLE_CATEGORIES)[number];

export const PEOPLE_LIST_TITLES: Record<PeopleCategory, string> = {
  top_friends: 'Mawkingbird: Top friends',
  mutuals: 'Mawkingbird: Mutuals',
  readers: 'Mawkingbird: Readers',
  idols: 'Mawkingbird: Idols',
  parasocials: 'Mawkingbird: Celebrities',
  bots: 'Mawkingbird: Bots',
  chatty: 'Mawkingbird: Chatty',
  broadcasters: 'Mawkingbird: Broadcasters',
  lively: 'Mawkingbird: Lively',
  graveyard: 'Mawkingbird: Zombies',
  other: 'Mawkingbird: Other',
};

export interface PeopleEvidence {
  inbound?: boolean;
  interaction?: boolean;
  boosted?: boolean;
  repliedTo?: boolean;
  /** At most 100 distinct observed posts per followed account; true means reply. */
  posts?: Record<string, boolean>;
}

export function recordPeopleEvidence(
  following: Account[],
  previous: Record<string, PeopleEvidence>,
  notifications: MastodonNotification[],
  own: Status[],
  home: Status[],
  myId: string,
): Record<string, PeopleEvidence> {
  const evidence: Record<string, PeopleEvidence> = Object.fromEntries(
    following.map((account) => [
      account.id,
      {
        ...previous[account.id],
        posts: { ...previous[account.id]?.posts },
      },
    ]),
  );
  for (const notification of notifications) {
    const person = evidence[notification.account.id];
    if (!person) continue;
    person.inbound = true;
    if (['mention', 'favourite', 'reblog', 'status'].includes(notification.type)) {
      person.interaction = true;
    }
    if (notification.type === 'reblog') person.boosted = true;
  }
  for (const status of own) {
    if (status.account.id !== myId || status.reblog) continue;
    const target = status.in_reply_to_account_id;
    if (target && evidence[target]) evidence[target].repliedTo = true;
  }
  for (const wrapper of [...home].reverse()) {
    const status = wrapper.reblog ?? wrapper;
    const person = evidence[status.account.id];
    if (!person) continue;
    const posts = person.posts ?? {};
    // New observations go first so trimming does not discard the freshest sample.
    person.posts = Object.fromEntries(
      Object.entries({
        [status.id]: !!status.in_reply_to_id,
        ...posts,
      }).slice(0, 100),
    );
  }
  // Bound the total cache too, not just each person's contribution. Accounts
  // observed in this run get priority over older samples. Interaction facts
  // remain, while a new browser can always start again from server evidence.
  let remainingPosts = 5000;
  const priority = new Set([
    ...home.map((wrapper) => (wrapper.reblog ?? wrapper).account.id),
    ...Object.keys(evidence),
  ]);
  for (const id of priority) {
    const person = evidence[id];
    if (!person) continue;
    const posts = Object.entries(person.posts ?? {}).slice(0, remainingPosts);
    remainingPosts -= posts.length;
    if (posts.length) person.posts = Object.fromEntries(posts);
    else delete person.posts;
    if (!Object.keys(person).length) delete evidence[id];
  }
  return evidence;
}

export function categorizePeople(
  following: Account[],
  relationships: Relationship[],
  evidence: Record<string, PeopleEvidence>,
  now = Date.now(),
): Record<PeopleCategory, string[]> {
  const result = Object.fromEntries(
    PEOPLE_CATEGORIES.map((key) => [key, [] as string[]]),
  ) as Record<PeopleCategory, string[]>;
  const relations = new Map(relationships.map((relationship) => [relationship.id, relationship]));
  for (const account of following) {
    const relationship = relations.get(account.id);
    // Missing relationship data must never silently turn mutuals into celebrities.
    if (!relationship) throw new Error('The server did not return every relationship. Try again.');
    if (!relationship.following) continue;
    const person = evidence[account.id] ?? {};
    const mutual = relationship.followed_by;
    const posts = Object.values(person.posts ?? {});
    const ratio = posts.filter(Boolean).length / posts.length;
    const timestamp = account.last_status_at ? Date.parse(account.last_status_at) : NaN;
    const age = now - timestamp;
    const matches: Record<PeopleCategory, boolean> = {
      mutuals: mutual,
      top_friends: mutual && !!person.interaction,
      readers: !!person.boosted,
      idols: !mutual && !!person.repliedTo && !person.inbound,
      parasocials: !mutual && account.followers_count > 10_000,
      bots: account.bot === true,
      // Python requires five posts; a mention alone does not make someone chatty.
      chatty: posts.length >= 5 && ratio > 0.5,
      broadcasters: posts.length >= 5 && ratio < 0.2,
      lively: Number.isFinite(age) && age <= 30 * 86_400_000,
      // Missing/invalid metadata is unknown, not proof of inactivity.
      graveyard: account.last_status_at === null || (Number.isFinite(age) && age > 90 * 86_400_000),
      other: false,
    };
    // Unlike the Python SQL's historical "other" exclusions, keep a true remainder.
    matches.other = !Object.values(matches).some(Boolean);
    for (const category of PEOPLE_CATEGORIES) {
      if (matches[category]) result[category].push(account.id);
    }
  }
  return result;
}
