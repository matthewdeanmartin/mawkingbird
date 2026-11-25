# Landing-page login flows

Date: 2026-11-25

> **Superseded in part, the same day.** A browser check of this implementation
> found that the visitor model in section 2 held only at the login doors. Where
> the sections below disagree with this box, the box is right. Plan and findings:
> the two sprints listed here; live checks: `spec/test_plans/landing-and-connector-2026-11.md`.
>
> - **Anonymous is chosen or it is not.** `Auth.anonymousChoice` records it. The
>   front-door preview, `/invites`, shared messages and public links are not a
>   choice; "Continue without logging in", `/anonymous` and the account switcher
>   are. Without a choice, `/` and `/home` show the preview. Browsers from before
>   the record count as chosen if they hold Anonymous follows, hashtags, bookmarks
>   or their own server.
> - **The preview ends at any sign-in**, not only through its own buttons, and
>   offers the way back to the page that led to it.
> - **One header button, `app-open-app`:** a stranger signs in and returns; a
>   reader who chose no account gets the app; signed in, it names the app screen
>   instead of saying "Open the app" again. Tool indexes use it too (section 3).
> - **No login address may bounce** to a page still asking to sign in. A
>   Mastodon-only destination skips the network question
>   (`destinationNeedsMastodon`). `open-app.spec.ts` follows every door for every
>   visitor and tool.
> - **Misskey's account-less visitor is not signed in** (`signedInMatch`).
> - **Under a Bluesky account, `/login/mastodon` connects Mastodon** to it rather
>   than switching accounts; "separate account" is the smaller choice, and
>   `?add=1` still adds one. Code that needs "me on Mastodon" asks `MastodonMe`.
> - The return page survives a change of network, a refusal, a Bluesky sign-up
>   and account setup. `/unavailable` offers to sign in and come back.
> - `/for/*` header buttons go to `/` again (`/unbird` for Twitter).

This spec records the business rules agreed during the content-warning landing
page investigation and the subsequent review of public tool entry links. It
describes the implementation inspected on this date, its reasoning, and its
limits. It is not evidence that the changes have been deployed.

## 1. The visitor's task is the starting point

A person arriving from Google usually wants to solve the problem named by the
landing page. They have not necessarily chosen Mawkingbird as their regular
client, learned its navigation, or agreed to browse anonymously.

The page must distinguish three things:

1. Advice or tools usable without a Mawkingbird login.
2. Actions requiring an authenticated account on a particular network.
3. Preferences that affect only reading in Mawkingbird.

Do not promise to change a Mastodon account setting when the available control
only changes this browser's Mawkingbird preferences. Explain that scope before
the control or sign-in request, rather than revealing it in a later FAQ.

Signing in establishes an account connection. It does not establish that the
person is an experienced Mawkingbird user, and does not make the original task
irrelevant.

## 2. Anonymous browsing and sign-in intent are separate

There are at least two kinds of anonymous visitor:

| Visitor | Meaning | Expected behavior |
| --- | --- | --- |
| Fresh search visitor | No established account or browsing choice | Read the public page; offer login when needed for the chosen action. |
| Implicit Anonymous session | The app entered a public browsing context on the visitor's behalf | Do not interpret this as declining login. |
| Explicit Anonymous reader | The person chose to browse without signing in | Keep that browsing choice until they choose otherwise. |
| Connected account | An identity exists on a particular network | Evaluate whether it satisfies this task's network requirement. |

An explicit click on a login action is new intent, including for someone who
previously chose Anonymous. Show the requested sign-in flow. Merely opening that
flow must not replace their current identity or start an OAuth authorization.

Conversely, opening a landing page must not force an Anonymous reader to log in.
Public tools that work without an account must continue to work. The login
chooser retains its explicit option to look around without an account.

Do not infer these rules from the HTTP referrer. A visitor can arrive through
Google, a bookmark, a shared link, or an existing tab. The relevant inputs are
the current account capability, the requested page, and the action they choose.

## 3. Task-specific login returns to the landing page

The agreed flow is:

```text
Public task page
    → explicit login action, carrying this page's return destination
    → network choice if needed
    → network login / authorization
    → the same task page, in the same language
    → an explicit action to open the relevant app or settings screen
```

This separates establishing the account connection from continuing into the
larger application. The visitor can see the original explanation again and make
the next choice in context.

Business rules:

- Successful task-specific login must not normally dump the visitor at Home.
- Preserve the translated landing-page path, not just its English equivalent.
- Preserve supported query parameters that carry the task's context.
- The signed-in landing page may expose its focused workbench directly. Where
  the task continues in a separate app screen, provide an explicit link there.
- For language help, that continuation is `/settings/i18n`.
- Login alone must not change the settings described by the page.
- Failed or cancelled login must not be presented as a completed task.
- An existing suitable session can return directly to the requested landing
  page without making the person authenticate again.

The continuation implemented here is an inline action, not a new modal, new
page, or automatic settings redirect. Existing translated “Open app” labels are
reused. The signed-in shell supplies account context.

### Generic indexes are different

The Traditional Chinese index at `/zh-hant/`, like the other tool indexes, lists
many tasks. Its generic app button now opens `/login`. It does not directly open
language settings or silently select anonymous browsing.

That generic action currently has no task-specific `next` destination, so Home
is its normal post-login destination. A person who chooses a particular tool
from the index gets that tool's task-specific return flow. This is an explicit
boundary of the implementation, not a claim that every public link returns to
its originating page.

## 4. Content warnings: answer the Mastodon question first

For `/turn-off-content-warnings-mastodon/` and its language versions:

1. Explain the Mastodon website procedure first: Preferences → Appearance,
   expand posts marked with content warnings, show all media, then save changes.
2. State that no Mawkingbird login is needed for that procedure. The person may
   need to log in on their own Mastodon server.
3. Explain that mobile apps and other clients may have separate preferences.
4. Offer a server-domain or full-handle field that produces a link to the
   server's `/settings/preferences/appearance` page.
5. Keep the guide and server link available after Mawkingbird sign-in.
6. Present Mawkingbird's controls as an optional, explicitly browser/client-only
   alternative below the answer.

The helper constructs a link locally. It does not perform discovery, authorize
Mawkingbird, change the browsing server, save server preferences, or claim to
verify that the destination runs Mastodon. The destination is displayed before
the person follows the link.

The current input rules accept a domain, an HTTPS origin, or a full handle such
as `@reader@example.social`. They reject whitespace, backslashes, credentials,
non-HTTPS URLs, paths other than `/`, query strings, and fragments. A hostname
must contain a dot. This is a public-server helper, not a general development
server URL editor.

A connected Mastodon account can prefill the server. An Anonymous reading
server cannot: a person may be browsing somebody else's public server and have
no account there.

The existing signed-in workbench can read server preferences, but cannot write
them through Mastodon's preferences API. Its own switches affect Mawkingbird
for that account in this browser. Failure to read the server preferences must
not remove the independent server-settings link or the written instructions.

## 5. Why the old button appeared to blink

In this application, `Auth.isAuthenticated` means an identity kind exists. That
includes the browser-local Anonymous identity. It does not universally mean
“the visitor has signed in to the network this action needs.”

The old Mastodon login entry checked that broad predicate and immediately
returned an Anonymous visitor to `next`. The landing page correctly recognized
that there was no usable Mastodon login and displayed its login button again.
The brief navigation between those two pages looked like a blink.

The fix leaves the global identity model and Anonymous route access intact.
It narrows the decisions at the login entry points instead.

## 6. Technical implementation

### Network-specific entry checks

| Entry | Existing session that can bypass the form | Exceptions / return behavior |
| --- | --- | --- |
| `/login/mastodon` | A Mastodon token is present and the identity is not Anonymous | OAuth callbacks and explicit `add` flows still run. Return to the validated destination. |
| `/login/bluesky` | The active identity is Bluesky-primary | Explicit `add` still runs. Another network's identity does not satisfy a Bluesky sign-in request. |
| `/login` | An authenticated identity that is neither Anonymous nor a Misskey visitor | Explicit `add` still offers network choice. Use validated `next`, otherwise Home. |

These are capability checks at entry, not fresh remote token verification. A
present but expired token remains subject to the app's existing session-error
handling. This change does not add a verification request to every login visit.

The generic chooser is not a substitute for a task's network requirement.
Mastodon-only landing actions use the Mastodon door; tasks offering more than
one network can use the chooser or their explicit network buttons.

### Return destination and OAuth handoff

`loginDestination()` is the shared allowlist. It accepts registered focused-app
roots and the existing small set of additional return pages, including Watch
and Unbird. Unknown paths and external URLs fall back to `/home`. Query
parameters are normalized and preserved for accepted paths; fragments are
discarded. Arbitrary settings URLs were not added to this allowlist for this
change: the landing page owns the later settings link.

The handoff works as follows:

- A task's public login link supplies `next` using its own localized path.
- `LoginChooser` validates that value and passes it to `LoginDoors`.
- Router-based network doors carry `next` alongside any `add` flag.
- Mastodon login stores the destination with the pending OAuth application
  state, and validates it again when restoring the callback.
- Bluesky identity login uses the existing tab-scoped return storage because
  its OAuth SDK owns the OAuth state. The destination is checked again when
  consumed.
- `/login` remains the existing Mastodon callback address. Requests containing
  callback parameters are forwarded to `/login/mastodon` with those parameters
  intact, before normal chooser redirects are considered.

The existing reload-style doors used for account addition retain their separate
plain-link behavior; the task-return change is on the router-based chooser
path. If return storage is unavailable or lost, the existing fallback can still
be Home. This implementation does not promise recovery of task context after
storage loss.

### One URL, public and signed-in presentations

`focusedAppRoutes()` registers the signed-in shell version before the public
version of a tool's path. A matching account gets route data `inShell: true`;
other visitors fall through to the public page at the same path.

After login, returning to that path therefore selects the signed-in
presentation without requiring a second public URL. Templates use `inShell`
to expose their workbench and the explicit `.app-destination` continuation.
The continuation uses the original relevant app route, such as language
settings, analytics, bookmarks, or Unbird.

The existing matchers remain distinct: `mastodonSignedInMatch` requires a token
and excludes Anonymous; `signedInMatch` currently uses the broader authenticated
identity check while excluding Anonymous. This work did not redesign all route
matchers or establish a uniform capability model for every network and visitor
mode. New tasks must choose and test their matcher deliberately.

### Prerendering and SEO

Public guidance must render without browser storage or a connected account.
The content-warning component checks `isPlatformBrowser(PLATFORM_ID)` before
injecting `Auth` for server prefill. On the server, the field starts empty.
Account-dependent workbenches remain deferred.

This boundary matters: instantiating the browser session dependency graph during
prerendering initially caused the content-warning documents to be omitted. A
regression test now forbids account-state injection in the server-render case.

Existing public URLs, headings, canonical routing, and language alternates are
preserved. Content-warning descriptions and prerender content assertions were
updated to describe the website guide. Public app links continue to use the
existing app-link SEO treatment.

## 7. Scope and limits

- The entry-link sweep covers the focused tool pages and language tool indexes,
  including the shared image-download page. Their translations use the same
  rule.
- Tools usable anonymously remain usable without login. For example, the image
  downloader's workbench remains public; its app/login links no longer bounce
  an Anonymous visitor back to themselves.
- Separate marketing pages that explicitly advertise an app preview were not
  converted wholesale into mandatory login pages.
- No new pages, shared visual widgets, server write endpoints, or Native host
  changes were introduced. The implementation uses existing fields, buttons,
  routing, and OAuth handoff mechanisms.
- Returning to the landing page is not a promise to preserve every transient
  form field across OAuth. Only context explicitly carried in the URL or
  existing storage has that guarantee.
- A successful local gate does not prove successful live authorization against
  every Mastodon server or Bluesky provider.

## 8. Regression contract

Future changes must preserve these observable outcomes:

- Fresh, implicit Anonymous, and deliberately Anonymous visitors can explicitly
  open login without being bounced back or having their identity changed merely
  by viewing the form.
- A different network's identity does not satisfy network-specific login.
- A suitable saved session returns to the requested task; callbacks and
  add-account flows are not intercepted.
- Network choice preserves the validated destination and the add-account flag.
- After OAuth, a localized task returns to its localized landing page, with an
  explicit continuation to the appropriate app screen.
- `/zh-hant/` opens the chooser through its generic app button.
- Both entry links on `/download-mastodon-images/` reach Mastodon login for fresh
  and Anonymous visitors.
- The CW guide remains first before and after sign-in, accepts valid server
  inputs, rejects invalid links, and keeps working when preference reads fail.
- CW prerendering does not instantiate browser-only account state. The answer
  is readable without JavaScript; interactive layouts fit mobile widths.

Validation recorded for the implementation on 2026-11-25: static checks, lint,
design inventory, 11,346 full-suite tests, production build/budgets, SEO build
and browser checks, deep-link audit/tests, and design verification. Four design
story-loading timeouts passed when their file was rerun alone. Integration,
Native builds, and the deep-link browser suite were not run. Writing this spec
does not rerun or extend that evidence.

Two previous tests were replaced intentionally: the CW signed-in presentation
test now requires the guide to remain visible; the Bluesky redirect test now
requires a Bluesky identity. Their reasons are recorded in
[`ui/test-removals.md`](../ui/test-removals.md).

## 9. Source map

- [Focused route construction](../ui/src/app/app.routes.ts)
- [Account route predicates](../ui/src/app/platform/session/auth.guard.ts)
- [Return allowlist and tab-scoped storage](../ui/src/app/platform/session/login-destination.ts)
- [Mastodon login and callback](../ui/src/app/accounts/sign-in/login/login.ts)
- [Bluesky login](../ui/src/app/accounts/sign-in/login-bluesky/login-bluesky.ts)
- [Login chooser](../ui/src/app/accounts/sign-in/login-chooser/login-chooser.ts)
- [Network doors](../ui/src/app/accounts/sign-in/login-doors/login-doors.ts)
- [Language landing-page continuation](../ui/src/app/public-pages/language-landing/language-landing.html)
- [CW guide and helper](../ui/src/app/moderation/mastodon-content-warnings/mastodon-content-warnings.ts)
- [CW workbench](../ui/src/app/moderation/mastodon-content-warnings/content-warnings-workbench.ts)
- [Public-page regression tests](../ui/src/app/public-pages/focused-apps/translated-pages.spec.ts)
- [SEO browser journeys](../ui/scripts/check-seo-browser.mjs)
