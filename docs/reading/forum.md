# Read conversations in Forum

Forum finds the conversations in a feed: posts where people answer each other. It traces each one back to the post that started it and shows the whole exchange, so you can follow a discussion instead of a stream of separate replies.

Forum needs a signed-in Mastodon account. Open it from the app switcher at the end of the top menu.

## What counts as a discussion

A discussion has at least two posts by at least two different people. So Forum leaves out:

- a lone post, even one that asks a question;
- a thread of someone replying to themselves, such as a long multi-part post.

## Choose where to look

Use **Look in** to pick a starting point, then choose **Scan**:

- **Home timeline**: posts from people you follow.
- **My posts and mentions**: your own posts and the replies that mention you. This is the quickest way to fill **Mine** and **Joined**.
- **List**: one of your Mastodon lists.
- **A hashtag**: recent posts under a tag.

## What a scan costs

Mastodon has no "show me conversations" feature, so Forum asks your server one question at a time: it reads a page of the feed, then asks about the posts that look like conversations. Each question is one request, counted on the page as **calls**.

- The first scan uses up to **10 calls**.
- **Scan deeper** adds 10 or 25 more, continuing where the last scan stopped.
- One scan never uses more than **50 calls** to your server.
- Calls to other servers are counted separately, each server with its own
  allowance, and shown as "more on other servers".
- **Stop** ends a scan at once and keeps everything found so far. If your server asks Forum to slow down, it stops the same way.

The most promising posts are asked about first: conversations you are in, then replies between different people, then posts with many replies.

Finding nothing after the first scan is normal. Try **Scan deeper** or a different place to look.

## Conversations from other servers

When a conversation started on another server, Forum may also ask that server for its public view. That server usually has replies yours never received, and sometimes the post that started it all. This uses one call to that server and only reads what it shows publicly.

When that turns up a post your server did not have, Forum asks your server to fetch it too. Then you get your server's own copy, which you can reply to, and replies only your followers can see. This uses two calls to your server. Whenever your own server has a post, Forum shows your server's copy.

A discussion marked **Partial thread** is one where no server Forum asked could reach the post that started it. You see as far back as it goes.

## Tabs and sorting

The menu across the top cuts the same list five ways:

- **Talk**: every discussion found.
- **Asked**: discussions whose first post asks a question.
- **Friends**: discussions started by people you follow.
- **Mine**: discussions you started.
- **Joined**: discussions you replied to but did not start.

**Recent** sorts by the latest reply. **Popular** sorts by replies from people you follow, then by all replies.

While a scan is running, discussions already on screen keep their place. When new ones arrive below what you are reading, **Sort the list again** puts them in order.

## Narrow the list

The left side lists the **Hashtags**, the servers the discussions **Started on**, and their **Language**, each with how many discussions have it. Choose one to show only those discussions. Choosing two from the same group shows either; choosing from different groups shows discussions that match both. Choose a value again, or **Clear filters**, to undo it.

Your choices are part of the page address, so **Back** undoes them and you can share a filtered view.

On a narrow screen, these appear under **Filters** above the list.

## Who is in a discussion

The right side shows people:

- beside the list, **Most active**: who takes part in the most discussions found;
- beside an open discussion, **In this discussion**: everyone in it, with who started it, who you follow, and how many posts each wrote.

Choose a person's name to show only the discussions they are in. Choose their picture to visit their profile.

In a discussion you can also:

- **Follow everyone**: follow the people in it you do not follow yet. Mawkingbird shows how many that is before it starts.
- **Add everyone to a list**: add them to one of your lists, or a new one. Mastodon lists only hold people you follow, so the dialog says how many can be added.

On a narrow screen, these appear under **People**.

People you have muted or blocked in Mawkingbird are left out of Forum, along with discussions they started.

## Open a discussion

Choose the line under a discussion (its replies, people and latest reply) to open it. The whole conversation shows in reading order, with the reply box under the first post. Posts you open from Forum stay in Forum, and **← Back to discussions** returns to the list where you left it.

Found discussions last until you reload the page or start a new scan. Nothing is saved.

Next: [Understand your Home feed](home-feed.md).
