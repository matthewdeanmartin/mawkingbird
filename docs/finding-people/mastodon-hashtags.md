# How hashtags work on Mastodon

A Mastodon hashtag is a topic label in a post, such as `#Gardening`. People can search for it, open its timeline and follow it. It is one of the simplest ways for a post to reach interested readers beyond an author's existing followers.

## Write a tag people can find and read

Put `#` immediately before the word or phrase, with no spaces inside. For a multiword tag, capitalize each word, as in `#MastodonForArtists`. Mastodon treats letter case as equivalent when matching tags, but the capitals help screen readers pronounce the separate words. Choose a few relevant tags that describe the post; a long string of unrelated tags makes it harder to read.

## Follow a tag

Search for a topic and choose the **Hashtags** result, or open a hashtag on a post. On a signed-in Mastodon account, follow the tag to bring matching public posts into Home. You follow the topic, not the people using it. You can unfollow it later without changing your account follows. [Mastodon's posting guide](https://docs.joinmastodon.org/user/posting/#hashtags) explains that a public post with a followed tag can appear in Home even when it is a reply.

If a tag looks quiet, try a synonym or a more specific phrase. Mawkingbird's [similar hashtags tool](https://mawkingbird.com/mastodon-similar-hashtags/) helps find related spellings and topics. The [community guides](https://mawkingbird.com/communities/) group useful tags with people and servers for each interest.

## Why two people may see different tag timelines

Each Mastodon server knows the posts it has received from local users and remote accounts it encounters. A tag timeline on one server can therefore differ from the same tag on another. A local view restricts results to that server's users; a broader federated view can include remote posts known to it. Neither is a complete global index. The [timeline API documentation](https://docs.joinmastodon.org/methods/timelines/#view-hashtag-timeline) describes that local filter.

Mastodon's Home feed is driven by follows, including followed hashtags. Explore can show [trending hashtags](https://docs.joinmastodon.org/user/preferences/#trending), but a tag does not require a trending algorithm to be useful. Follow a topic you care about and the matching posts come to you.

Checked against Mastodon's guides on **12 November 2026**. Next: [Search for an interest](search-interests.md) or [find people to follow](find-people.md).
