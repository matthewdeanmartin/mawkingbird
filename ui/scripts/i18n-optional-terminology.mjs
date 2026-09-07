/**
 * Version 10: verified English-only Terminology.words arguments from reviewed call sites.
 * Non-English whole messages may spell/inflect their canonical noun instead.
 * This map is a validation-policy dependency, deliberately outside source/context
 * hashes: English/custom vocabulary and fixed translation inventories are unchanged.
 * Never allowlist user data, counts, names, or a parameter merely named `posts`.
 * Evidence: the corresponding account/feed analytics, compose, effective audience,
 * feed picker/members and algo templates bind these arguments directly to Words.
 * Preserve these bindings for English users. In accounts.authors, postsWord is
 * vocabulary while posts is an actual numeric value and remains mandatory.
 */
export const optionalTerminology = Object.freeze({
  'accountAnalytics.barTitle': ['posts'],
  'accountAnalytics.basedOnLast': ['posts'],
  'accountAnalytics.busiestDay': ['posts'],
  'accountAnalytics.getMorePosts.aria': ['posts'],
  'accountAnalytics.hashtagsAndLinks': ['post'],
  'accountAnalytics.postsInWindow': ['posts'],
  'accountAnalytics.postsPerMonth.aria': ['posts'],
  'accountAnalytics.postsPerWeek.aria': ['posts'],
  'accountAnalytics.postsPerWeekday.aria': ['posts'],
  'accountAnalytics.weekdayBarTitle': ['posts'],
  'compose.addAnotherPost': ['noun'],
  'compose.postLanguage': ['noun'],
  'compose.postTo': ['noun'],
  'compose.removeFromThread': ['noun'],
  'compose.scheduleThis': ['noun'],
  'compose.suggestHashtagsFor': ['noun'],
  'compose.translateThis': ['noun'],
  'effectiveAudience.how.effective': ['post'],
  'effectiveAudience.how.lowCadence': ['posts'],
  'feedAnalytics.accounts.authors': ['postsWord'],
  'feedAnalytics.composition.rowTitle': ['posts'],
  'feedAnalytics.loading': ['posts'],
  'feedAnalytics.sample.optionTitle': ['posts'],
  'feedAnalytics.sample.paged': ['posts'],
  'feedAnalytics.sample.supplied': ['posts'],
  'feedAnalytics.timing.dayTitle': ['posts'],
  'feedAnalytics.timing.hourTitle': ['posts'],
  'feedAnalytics.timing.postsPerDay': ['posts'],
  'feedAnalytics.timing.postsPerHour': ['posts'],
  'feedLanguagePicker.description': ['posts'],
  'feedMembers.postCount.one': ['posts'],
  'feedMembers.postCount.other': ['posts'],
  'feedMembers.sample.optionTitle': ['posts'],
  'feedMembers.summary.one': ['posts'],
  'feedMembers.summary.other': ['posts'],
  'pages.algo.engagement.boosts': ['boosts'],
  'pages.algo.filter.calmTitle': ['posts'],
  'pages.algo.filter.linksTitle': ['posts'],
  'pages.algo.filter.shuffleTitle': ['posts'],
  'pages.algo.filter.tagsTitle': ['posts'],
  'pages.algo.filter.friendsTitle': ['posts', 'boosts'],
  'pages.algo.meta.summary': ['posts'],
  'pages.conversations.openAs': ['term'],
  'pages.drafts.meta.scheduledTitle': ['post'],
  'pages.drafts.meta.selfTitle': ['post'],
  'pages.drafts.scheduled.cancelTitle': ['post'],
  'pages.drafts.scheduled.cancelDialog.title': ['post'],
  'pages.explore.boostsCount': ['boosts'],
  'pages.home.anonPost.ariaLabel': ['post'],
  'pages.home.filters.calm.title': ['posts'],
  'pages.invites.tabs.ariaLabel': ['post'],
  'pages.pastes.actions.shareTitle': ['post'],
  'pages.pastes.actions.editForPostTitle': ['post'],
  'pages.pastes.actions.editForPost': ['post'],
  'pages.search.bluesky.loadedPosts': ['postType'],
  'pages.search.bluesky.loadedPostsNoNewSearch': ['postType'],
  'pages.search.bluesky.maximumPosts': ['postType'],
  'pages.search.bluesky.minimumPosts': ['postType'],
  'pages.search.bluesky.noLoadedPosts': ['postType'],
  'pages.search.bluesky.noPostsMatched': ['postType'],
  'pages.search.bluesky.repeatNote': ['postType'],
  'pages.search.bluesky.showingPosts': ['postType'],
  'pages.search.bluesky.sortPosts': ['postType'],
  'pages.search.bluesky.minimumBoosts': ['boostType'],
  'pages.search.card.arrivedWithoutDate': ['post'],
  'pages.search.found.posts.one': ['post'],
  'pages.search.found.posts.other': ['posts'],
  'pages.search.placeholder.posts': ['posts'],
  'pages.search.refine.collapseHint': ['posts'],
  'pages.search.refine.collapseRepeatedSentence': ['posts'],
  'pages.search.refine.collapsed': ['posts'],
  'pages.search.refine.sortPosts': ['posts'],
  'pages.search.refine.onlyLeft': ['postWord'],
  'pages.search.results.loadedSummary': ['postsWord'],
  'pages.search.results.repeatNote.one': ['postWord'],
  'pages.search.results.repeatNote.other': ['postsWord'],
  'pages.search.server.works': ['postWord'],
  'pages.tag.mine.none': ['posts'],
  'pages.tag.mine.summary': ['posts'],
  'pages.tag.myPosts': ['posts'],
  'pages.thread.reader.withCount': ['posts'],
  'pages.write.addPostButton': ['noun'],
  'pages.write.board.title.parked': ['noun'],
  'pages.write.board.title.selfOnly': ['noun'],
  'pages.write.scheduleSingleTarget': ['post'],
  'pages.write.segmentCount.one': ['noun'],
  'pages.write.segmentCount.other': ['noun'],
  'pages.write.splitSummary.one': ['noun'],
  'pages.write.splitSummary.other': ['noun'],
  'searchServerDiscovery.candidate.found': ['posts'],
  'settings.connections.hugo.fromFilenameTitle': ['post'],
  'settings.connections.twitter.follows.accountSummary': ['postsWord'],
  'pages.profile.media.replyToThis': ['term'],
  'pages.search.accountField.minimumPosts': ['posts'],
  'pages.search.accountField.maximumPosts': ['posts'],
  'pages.search.action.syntaxHelpTitle': ['post'],
  'pages.search.bluesky.basedOnLoadedPosts': ['postType'],
  'pages.search.bluesky.collapseRepeated': ['postType'],
  'pages.search.bluesky.collapseNote': ['postType'],
  'pages.search.bluesky.collapsedRepeats': ['postType'],
  // left-rail.html and status-card.html bind these directly to Terminology.words.
  // countLabel.label and actionFailure.verb remain mandatory localized inputs.
  'shell.left.boostedByNetwork': ['boosted'],
  'statusCard.deleteAndBoost': ['boost'],
  'statusCard.followersOnly': ['post'],
  'statusCard.moreActions': ['post'],
});

export const placeholderNames = (text) =>
  [...String(text).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((match) => match[1]).sort();

/** Retain exact multiplicity for data; optional vocabulary may only be omitted. */
export function placeholdersMatch(key, source, translated) {
  const wanted = placeholderNames(source);
  const got = placeholderNames(translated);
  const optional = optionalTerminology[key] ?? [];
  const remaining = [...wanted];
  for (const name of got) {
    const index = remaining.indexOf(name);
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return remaining.every((name) => optional.includes(name));
}
