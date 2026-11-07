# Write and Drafts sprint (2026-11)

Covers `sprint/write-drafts-2026-11.md`. Sections are added as each work item
lands; untested sections say so.

**Build:** local production build or `/test/` staging after the sprint commit.
**You need:** Mastodon M (a 4.5+ server, for quotes), and two browser tabs.

## 1. Autosave and version history

- [ ] Start a new draft in Write, type a sentence, stop for 3 seconds. The draft
      appears in the drafts list with no "Saved." banner, and the header shows
      "saved just now".
- [ ] Reload the tab mid-sentence (within 2 seconds of typing). No browser
      "leave site?" prompt; the text is in the draft after reload.
- [ ] Switch to another draft right after typing. No "unsaved work" dialog; both
      drafts keep their text.
- [ ] Open the same draft in two tabs. Edit in tab A, wait 3 seconds, then edit
      in tab B. Tab B shows "Autosave paused: this draft was changed in another
      tab". Tab A's text is not overwritten. Save draft in tab B keeps both.
- [ ] Edit a draft over more than 5 minutes, with a Save draft in between.
      Versions lists several entries, newest first, with word counts.
- [ ] Restore an older version. The editor shows it, the banner names its time,
      and Versions now lists both the restored text and the text you had before.
- [ ] Delete the draft from /drafts. Its versions are gone (create a new draft
      and check that Versions does not show the old text).
- [ ] With an image attached, leaving the page still asks first (images are not
      kept in browser drafts).

## 2. Word count and reading time

- [ ] The preview bar shows words next to the post count; a thread's `---` lines
      are not counted. Text over ~350 words also shows "N min read".
- [ ] Zen mode shows the word count.

## 3. Shortcuts

- [ ] Ctrl+S (Cmd+S on a Mac) in Write saves the draft; the browser's "Save page"
      dialog does not open.
- [ ] Ctrl+Enter opens the publish step and nothing is sent until you confirm.
- [ ] With the Versions dialog or the publish step open, Ctrl+Enter does nothing.
- [ ] Pressing `?` outside a text box shows the shortcut sheet with a
      "Write page" group.

## 4. Quote posts

- [ ] On Mastodon M, choose Quote on someone's post. A dialog opens: your text
      box first, the quoted post below it. It does not look like a reply.
- [ ] Post a quote from the dialog. It publishes as a quote (check on the web
      UI of your server).
- [ ] Type a few words, attach an image, then choose **Fullscreen edit**. Write
      opens with the text, the image and the quoted post under the editor. Wait
      3 seconds: it is autosaved as a local draft.
- [ ] Publish it from Write as a thread (add a `---` split). Only the first post
      is a quote; the second replies to the first.
- [ ] Try to choose Bluesky as the destination while quoting: Write says quotes
      go to Mastodon. **Remove quote** clears it.
- [ ] Reopen the saved draft from the drafts list: the quoted post preview loads.
- [ ] Quote a post whose author allows only followers to quote, from an account
      that does not follow them: the dialog says quoting is not allowed and
      shows no text box. (Needs a 4.5 server that sends `quote_approval`.)
- [ ] Quote a post that needs the author's approval: the dialog says so.
- [ ] Bluesky: Quote on a Bluesky post opens the same dialog without
      Fullscreen edit, and still posts to Bluesky.

## 5. Scheduling and parking

- [ ] /drafts shows "N of 300 scheduled slots used, M of them by parked
      drafts". With more than 20 scheduled posts, all of them are listed.
- [ ] Park 26 single-post drafts on one day (or seed 25 scheduled posts on the
      default park day). The 26th lands on the next day instead of failing.
- [ ] Park a draft that is a thread: it is refused with an explanation and
      nothing is sent.
- [ ] On an upcoming scheduled post, **Change time** to tomorrow: the time
      changes on the server (check the web UI). A time under 5 minutes away, or
      a day that already has 25, is refused before sending.
- [ ] On an upcoming scheduled post with an image, choose **Edit**. Write opens
      with the text, image and time. Change the text and publish: confirm the
      prompt. The new version is scheduled with the image, and the original is
      gone. **Verify the image survived:** this reuses the original's uploaded
      media id, which a live server must accept.
- [ ] Same, but decline the prompt: nothing changes on the server.
- [ ] Parked post with an image → ••• → **Edit on the server**: same flow,
      and the time stays far in the future.
- [ ] In Write, attach an image, choose **Park on server**, then publish. The
      post appears under Drafts as parked with 📎 1, and does not go out.
- [ ] Park on server is not offered for a thread.

## Findings

_None yet._
