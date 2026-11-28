# Firefox extension, sprint 4: manual test plan

Spec: `spec/firefox-extension.md`. Needs the sprint 4 web changes deployed
(Canary until production has them). Reload the add-on (0.4.0). About 10 minutes.

## 1. A video you haven't posted about

- [ ] Open a YouTube video with the sidebar open (`Alt+Shift+M`).
- [ ] The panel shows **Watch in Mawkingbird** and the line "Post about this
      video to watch it with the replies to your post as its chat."
- [ ] **Watch in Mawkingbird** opens Watch in a new tab, playing the video.
- [ ] The sidebar still shows the video's panel (not one about Mawkingbird).

## 2. Post, then watch with replies

- [ ] **Write about this page** → post it.
- [ ] **Watch with replies to your post** appears at once. It opens Watch with
      your post as the root; choose **Post replies** in the chat if it isn't.
- [ ] From another account, reply to the post: the reply shows in the chat
      within the refresh interval (Updates menu), without reloading.
- [ ] Switch to another tab for a while and back: the chat catches up (it
      doesn't refresh while hidden).

## 3. A video you posted about earlier

- [ ] Open a video you posted about (any link shape: youtu.be or watch?v=).
- [ ] **You posted about this page** lists it, and **Watch with replies to your
      post** is offered.
- [ ] A different video does not show that post.

## 4. Search precision

- [ ] On an ordinary article, **Posts about this page** lists only posts that
      actually link it (no posts that merely share words with its title).
