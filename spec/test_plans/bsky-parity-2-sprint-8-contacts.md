# Bluesky parity 2, sprint 8: find people you know

Written for: spec/bsky_parity.md sprint 8 (2026-11-21). Status: not run.

## Setup

**Bluesky A** in Mawkingbird with a real phone number you can receive SMS on
(one of: US, CA, GB, AU, BR, DE, ES, FR, IT, JP, KR, NL, SE). A second person
**B** who has A's number in their phone and uses bsky.app's own "Find
contacts" with their number in A's contacts.

## Steps

- [ ] 1. Settings → Bluesky preferences → People you know → Find people you
      know. The page says what is sent and that it can be removed.
- [ ] 2. **First, the open question:** send yourself a code. If Bluesky refuses
      (an error right away), record the message: the contact endpoints may not
      accept a third-party sign-in. Stop here and note it in the spec.
- [ ] 3. The code arrives; enter it. The contacts step appears.
- [ ] 4. Paste B's number (and a few others, some local, some +international):
      the "numbers ready" count matches what you pasted, minus your own.
- [ ] 5. On Android Chrome, "Choose from my contacts" opens the system picker;
      elsewhere the button is absent. A vCard or CSV export adds its numbers.
- [ ] 6. Find them on Bluesky: B appears with a Follow button (once B has also
      imported A). Follow works.
- [ ] 7. Reload the page: B is still listed, with "Last checked" today.
- [ ] 8. Remove my contact data: asks first; afterwards the matches are gone,
      and bsky.app's Find contacts settings show no data.

## Pass

Steps 1–8 checked, or step 2's refusal recorded.
