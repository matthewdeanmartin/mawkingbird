---
name: live-test-plan
description: Write a manual test plan for Mawkingbird work that needs real accounts or a deployed build (Mastodon, Bluesky, Misskey sign-in, posting, OAuth, Native installers). Use at a stop point when automated tests can't cover a change.
---

# Live test plans

Plans written only in chat get lost in long conversations, so each one is a file.

- Put it in `spec/test_plans/`, one file per feature or sprint
  (`<feature>-<sprint>.md`), and add a row to the table in
  `spec/test_plans/README.md`.
- Link it from the sprint's evidence file in `spec/sprint/`, and name it in the stop
  report's **Waiting on you** line.

## Shape

```md
# <Feature>: <what to try>

Build: /test/ preview, /canary/, or Native <version>. Accounts: <which test accounts>.

## Setup
- …

## Steps
- [ ] 1. Do X at phone width. Expect Y.
- [ ] 2. …

## Findings
(Owner fills this in.)
```

Each step has one action and one expected result, in the words on screen. Use test
accounts for anything that posts, follows or deletes. Say what automated tests
already covered, so the plan only tests what they can't.
