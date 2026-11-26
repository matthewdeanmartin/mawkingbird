// Show prep policy (spec/show-prep.md): the same for every topic, pure, tested.

/** @typedef {'feature' | 'review' | 'skip'} Verdict */
/** @typedef {{ verdict: Verdict, reasons: string[] }} Vetting */

const OPT_OUT = /#(nobot|noindex|nosearch|noarchive)\b/i;
const DAY = 86_400_000;

/**
 * Vet one status (boosts are unwrapped to the boosted post).
 * `feature` means pre-vetted, never broadcast-approved: a person still looks.
 *
 * @param {any} status A Mastodon status, as the public API returns it.
 * @param {{ languages?: string[], maxAgeDays?: number, now?: number }} pack
 * @returns {Vetting}
 */
export function vetStatus(status, pack = {}) {
  const post = status.reblog ?? status;
  const account = post.account ?? {};
  const now = pack.now ?? Date.now();
  const skip = [];
  const review = [];

  if (post.visibility && post.visibility !== 'public') skip.push('not public');
  if (account.discoverable === false) skip.push('author is not discoverable');
  if (account.indexable === false) skip.push('author asked not to be indexed');
  if (account.noindex === true) skip.push('author asked search engines to stay away');
  const profile = [
    account.note ?? '',
    ...(account.fields ?? []).map((f) => `${f.name} ${f.value}`),
  ].join(' ');
  if (OPT_OUT.test(profile))
    skip.push('profile opts out (#nobot, #noindex, #nosearch or #noarchive)');
  if (post.in_reply_to_account_id && post.in_reply_to_account_id !== account.id) {
    skip.push('a reply to someone else: show the thread root instead');
  }
  const age = now - Date.parse(post.created_at);
  if (pack.maxAgeDays && age > pack.maxAgeDays * DAY)
    skip.push(`older than ${pack.maxAgeDays} days`);

  if (post.spoiler_text || post.sensitive) review.push('content warning or sensitive media');
  if ((post.media_attachments ?? []).some((m) => !m.description))
    review.push('media without alt text');
  if (account.bot) review.push('bot account');
  if (account.created_at && now - Date.parse(account.created_at) < 7 * DAY) {
    review.push('account younger than 7 days');
  }
  if (pack.languages?.length && post.language && !pack.languages.includes(post.language)) {
    review.push(`language ${post.language}`);
  }

  if (skip.length) return { verdict: 'skip', reasons: [...skip, ...review] };
  if (review.length) return { verdict: 'review', reasons: review };
  return { verdict: 'feature', reasons: [] };
}
