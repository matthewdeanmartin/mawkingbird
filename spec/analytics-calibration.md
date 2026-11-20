# Reach calibration record

Model: `ui/src/app/accounts/reach-model.ts` (`REACH_MODEL`). Plan:
[sprint/analytics-reach-2026-11.md](sprint/analytics-reach-2026-11.md).

## 2026-11-20: `typicalBoosterAudience` 250 → 268

Command: `cd ui && make reach-calibration`. Data:
[analytics-calibration-2026-11-20.json](analytics-calibration-2026-11-20.json)
(refit offline with `make reach-calibration-replay`).

Cost: **49 public API calls** over three servers, sequential, 1.2 s apart per
server. Calls per account: one lookup, one page of 40 posts, and one
`reblogged_by` page (80 boosters) for each of up to 12 boosted threads.

| Account                    | Followers | Boosted threads | Median booster audience |
| -------------------------- | --------: | --------------: | ----------------------: |
| ohai.social/@everybodhi    |        89 |               3 |                     492 |
| mastodon.social/@mistersql |     1,538 |               4 |                      11 |
| mstdn.social/@flyscifiguy  |        16 |               4 |                   1,539 |
| mstdn.social/@stux         |   167,542 |              12 |                     268 |
| mastodon.social/@Mastodon  |   878,814 |              12 |                     253 |

1,373 boosters seen in total. The pooled median was 259.

**Chosen value: 268**, the median of the per-account medians, so every
account weighs the same. A least-error grid fit gave 846. It was based on
~11 small-account threads where a single booster decides the result, and it
is reported in the JSON for comparison only.

Quick vs Full net reach on booster-sensitive threads (boosters ≥ 10% of the
potential audience), as the median of |log(quick/full)|: 0.136 at 250 and
0.130 at 268. That is roughly 13% apart per thread. Larger single-thread
gaps (e.g. 21 vs 306) come from one well-followed booster, which only Full
reach can see.

### Observations

- The old constant was already close. The improvement in Quick reach comes
  from the net curve and from thread grouping, not from this number.
- **Very large accounts reach the cap.** For @Mastodon and @stux, the curve
  exceeds 100% of the potential audience, so net reach equals potential
  (followers + boosters). This is how the reference method behaves. Whether
  to damp it for very large accounts is an open owner question; nothing is
  changed yet.
- Some posts have more boosts than visible boosters (private boosters or
  hidden ones, or more than one page of 80). Those boosts fall back to the
  constant.
