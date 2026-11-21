# Test plan: reply-guy controls (live accounts)

Needs: a Mastodon account A (you), a second account B that A does **not**
follow, and an account C that A follows but that doesn't follow A back. Repeat
the starred steps on Bluesky and on Misskey.

## Defence (people you don't follow)

1. ★ From B, reply to one of A's posts. As A, open the thread. B's reply shows
   a dashed "you don't follow" chip, and its text sits behind "Reply from
   someone you don't follow" + Show. Show reveals it; the chip stays.
2. ★ From C, reply to the same post. No chip, no guard (you follow C; them not
   following back doesn't matter).
3. ★ From B, reply to C's reply under A's post (two levels deep). Still guarded.
4. Open someone else's thread with replies from strangers: chips only, no
   guards.
5. Open B's reply itself (click it, so it is the focused post): chip, no guard.
6. ★ In Notifications, B's mention shows the chip and "From someone you don't
   follow" + Show. C's mention shows normally.
7. Follow B from the hover card or profile, go back to the thread: the guard
   and chip are gone without a reload.
8. Settings → Trust: trust B individually. B's reply is still guarded (trust is
   about CWs, not about who is replying).
9. ★ From B, quote A's post. As A, open the post's quotes list: B's row has the
   chip, and its excerpt waits behind Show.

## Settings

10. Settings → Wellness → "One click before replies from people I don't
    follow" is on by default. Turn it off: guards go, chips stay.
11. Turn on "Hide replies from people I don't follow" (Protections). B's
    mentions and replies vanish from Notifications; C's remain. No level
    (Gentle/Strong) turns it on. With it on, a new mention from B should not
    light the notifications dot once B's relationship is known.

## Warning (people who don't follow you)

12. ★ As A, reply to C's post (C doesn't follow A): a notice beside the
    translated-post warning reads "Heads up: @C doesn't follow you. They'll
    still be notified of your reply." Check the inline reply, the thread reply
    box and the profile photo view.
13. ★ Quote C's post: the same notice with "…of your quote" in the quote
    dialog (Misskey: in the inline quote box).
14. Reply to someone who follows A: no notice.

## Account switch

15. Switch to another signed-in account and reopen the thread: chips and guards
    reflect the *new* account's follows, not the previous one's.
