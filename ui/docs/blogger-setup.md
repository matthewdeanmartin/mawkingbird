# Blogger connector setup

Publishing to Blogger needs a **Google OAuth client id**. This document covers
where it comes from, what Google requires before strangers can use it, and the
escape hatch for users who need their own.

## Why an API key is not enough

Google issues two different credentials and only one of them works here:

| Credential | Identifies | Can it publish? |
| --- | --- | --- |
| API key (`AIza…`) | the application | **No.** `users/self/blogs` returns `403 PERMISSION_DENIED`, and posting is impossible. |
| OAuth client id (`….apps.googleusercontent.com`) | the **user** | Yes. |

Publishing is an act by a person, so it needs a credential that says which
person. There is no API-key path to it and no setting that unlocks one.

The client **secret** Google issues alongside the client id is deliberately
unused. A browser app cannot keep a secret — anything in the bundle is public —
so this connector uses PKCE instead, which proves the token request came from
the same browser that started the flow. **Never put the secret in
`environment*.ts`.**

## Creating the client id

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project (or reuse one) and enable the **Blogger API**.
2. **Credentials → Create credentials → OAuth client ID**, type **Web
   application**.
3. Add an **Authorized redirect URI** for every origin the app is served from:

   ```
   https://mawkingbird.com/integrations/blogger/callback
   https://mawkingbird.com/canary/integrations/blogger/callback
   http://localhost:4200/integrations/blogger/callback
   ```

   The canary deployment is a separate entry because it is served under a
   different base href — see the deploy notes. Missing an entry produces
   `redirect_uri_mismatch`, which the connector translates into a message naming
   the exact URI to add.
4. Add the same origins under **Authorized JavaScript origins**.
5. Put the client id in `bloggerClientId` in `src/environments/environment.ts`
   and `src/environments/environment.mockingbird.ts`. Empty hides the connector
   rather than showing a button that cannot work.

## Google verification, and the 100-user cap

The scope this connector requests, `https://www.googleapis.com/auth/blogger`, is
classified by Google as **sensitive**. Two consequences:

- Until the project passes Google's app verification, the consent screen shows
  **"Google hasn't verified this app"**, which users get past via *Advanced → Go
  to (unsafe)*. The settings page warns about this in advance so it does not
  read as the app being broken.
- An unverified project serves at most **100 test users**, added by hand in the
  console. This is a hard cap, not a soft warning.

Verification requires a verified domain, a published privacy policy, a demo
video of the OAuth flow, and a review that takes days to weeks, with annual
re-certification. It is worth starting only once the app has enough Blogger
users to justify it.

Quota is also per-project: everyone using the shipped client id shares its
Blogger API quota, so one heavy user can rate-limit the rest.

## Users bringing their own project

Because of both limits above, the connector lets a user paste their own client
id under **Settings → Connections → Blogger → Use my own Google project**. It
overrides the shipped one and is stored unscoped in `localStorage` (a Google
Cloud project belongs to the human, not to a Mastodon persona — the same
reasoning as the OpenRouter key).

Their own project means their own quota, no 100-user cap, and no unverified-app
warning, since they own the project they are consenting to. The setup steps
above are reproduced on that settings page, including the exact redirect URI for
the current origin.

Switching client ids drops any existing access token: it was minted by the
previous client and the new one cannot use it. The chosen blog survives, since
it is the same blog either way.

## What is stored

| Key | Store | Why |
| --- | --- | --- |
| `mockingbird_blogger_token` | `sessionStorage`, account-scoped | A secret. Dies with the tab; there is deliberately no refresh token, which would be a year-long credential sitting in a browser. |
| `mockingbird_blogger_blog` | `localStorage`, account-scoped | The chosen blog and the profile-feed opt-in. Preferences, not secrets — re-choosing them every session would be busywork. |
| `mockingbird_blogger_client_id` | `localStorage`, unscoped | The user's own client id, if supplied. Public by design. |

Keeping the blog choice out of the token is what lets the **profile feed** work
with no Google session at all: reading a public RSS feed needs only the address.

## Networking notes

- The Blogger **API** (`www.googleapis.com`) is CORS-open and accepts the
  `Authorization` header, so publishing needs **no CORS proxy**. This also
  matters for safety: routing a Google token through a third-party proxy would
  give that proxy the ability to publish as the user.
- The Blogger **RSS feed** is not. It sends no `Access-Control-Allow-Origin` and
  commonly redirects to FeedBurner, so the profile feed goes through the user's
  configured CORS proxy, exactly as the Mataroa feed does.
