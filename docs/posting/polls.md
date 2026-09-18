# Add a poll

A poll asks readers to vote among a small set of choices.

## Create a poll

1. Start a new post.
2. Choose the bar-chart button labelled **Add poll**.
3. Enter at least two choices.
4. Use **Add choice** if you need a third or fourth choice.
5. Turn on **Allow multiple** if a voter may select more than one answer.
6. Choose how long voting will remain open.
7. Add a question or explanation in the main writing box.
8. Publish the post.

A poll can have two, three, or four choices. Available durations range from five minutes to seven days.

## Pick one or allow several

Leave **Allow multiple** off when the choices are alternatives and each person should choose one.

Turn it on when more than one answer can be true, such as “Which of these books have you read?” Make the question clear about whether several answers are allowed.

## Results and voting statistics

After voting or once a poll closes, results include bars and a **Voting statistics**
section, including in notifications. Expand it for voter count, the observed lead
over second place, and 95% confidence intervals shown as error bars. Multiple-choice
percentages use voters, not selections, so they can sum above 100%; the section also
shows average selections per voter.

Four votes out of ten really is 40% of the recorded votes. If those ten people were
an independent random sample, the corresponding population share is much less
certain: its 95% Wilson interval is approximately 16.8%–68.7%. An online poll is
usually self-selected, so these estimates cannot establish representativeness.

Leader and full-ranking assessments use conservative simultaneous 95% Hoeffding
bounds (a union bound across all options). They account for comparing several
options, unlike simply sorting the percentages or comparing individual Wilson
intervals. An inconclusive result does not prove a tie. Estimates apply to a fixed
sample, not repeated looks at a live poll. Missing counts never become zero-vote
evidence. Turnout needs an eligible-voter count, which the poll does not supply.

Methods: [Wilson intervals (NIST)](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)
and [Hoeffding confidence bounds (UC Berkeley)](https://ucb-stat-159-s21.github.io/site/Notes/hoeffding.html).

## Limits

Polls cannot be combined with media. Remove all attachments before adding the poll.

Polls are a Fedi feature in Mawkingbird. A Bluesky-only post cannot contain one. If the destination is **Both**, the poll goes to the Fedi copy only; the Bluesky copy contains the post's text without the poll.

Polls cannot be used in a post being sent to a blog or paste service.

Next: [Choose where a post is published](destinations.md).
