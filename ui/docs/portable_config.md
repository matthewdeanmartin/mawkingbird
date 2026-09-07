# Portable client configuration

Settings → Import/Export Config exports the browser-side Mockingbird setup to JSON, imports it by
file, pasted JSON, or URL, and can publish it as a permanent unlisted Pastepile. The implementation
lives in `portable-config.ts`, `config-sync.ts`, and `pages/settings/config/`.

## File format

Version 1 has this shape:

```json
{
  "kind": "mockingbird-client-config",
  "schemaVersion": 1,
  "minimumReaderVersion": 1,
  "exportedAt": "2026-08-02T00:00:00.000Z",
  "privacy": "standard",
  "values": {
    "mockingbird_client_prefs": "{\"theme\":\"dark\"}"
  }
}
```

Values stay as the exact strings held by `localStorage`; the owning services re-validate them when
the app reloads. The outer document is capped at 1 MB and each value at 256 KB. Imports reject an
unknown key, a key outside the file's declared profile, non-string values, unsupported versions,
and credential-shaped fields inside otherwise exportable objects.

`schemaVersion` identifies the writer's format. `minimumReaderVersion` lets a future writer obsolete
an unsafe reader after a catastrophic format problem. The version check is deliberately centralized
in `parsePortableConfig()` so conversions can be added there before a later version is accepted.

## What is included

Version 1 is global-only. Account-scoped keys are excluded even when they hold ordinary preferences:
the current scope suffix is derived from an access-token hash and does not survive reauthentication,
and two browsers may have different sets of signed-in accounts.

The default `standard` profile includes global entries classified as `setting`, except incidental
state such as the last account mode, rejected-server history, and dismissed nudges. The unchecked
“Include potentially private settings” option selects the `private` profile and adds only:

- home Mastodon server;
- selected/custom CORS proxy configuration, never its key;
- selected link shortener and branded domains, never its keys.

Both profiles always exclude credentials, caches, account-scoped settings, follows, blocks and
mutes, RSS and paste feeds, lists, bookmarks, saved searches, local moderation, usage history,
drafts, DMs, local posts, and other authored content. Those boundaries can be widened deliberately
in a later schema version without making version 1 unsafe.

## Runtime secret audit

The exporter does not merely maintain a denylist. It starts from the exhaustive
`storage-registry.ts` allowlist and rejects unregistered keys. Before returning a file it then:

1. reclassifies every emitted key and refuses `secret`, `cache`, and `content` tiers;
2. walks parsed values and refuses credential-shaped field names;
3. reads the actual secret-tier values currently in storage and refuses the export if any stored
   credential string appears in the serialized result.

The storage-registry source check remains the build-time complement to this runtime test.

## Import semantics

Import is replace-within-profile, not merge. Every eligible key named by the profile is overwritten,
and an eligible key absent from the file is reset. A standard import has no authority to delete the
three private configuration values. The UI previews every add/change/remove and requires confirmation
before applying and reloading.

## Remote sources and change detection

The user may keep a URL for on-demand, daily, or weekly checks. Each response is fetched again
immediately with browser caching disabled and both byte streams are hashed with SHA-256. Scheduled
checks are enabled only when the two hashes match. If the source changes between reads or cannot be
refetched, it is restricted to on-demand updates and the UI explains why.

The saved hash describes the remote bytes, not local storage. Editing a setting locally therefore
does not look like a remote update. A scheduled check stays quiet when the remote hash is unchanged
and prompts only when it changed; applying it uses the normal replace-within-profile importer.

Foreign fetches omit credentials. URL sources must use HTTP(S) and allow browser CORS. Pastepile
publishing is keyless, anonymous, unlisted, and requests `expiry: never`; omitting a configured free
Pastepile key is intentional because Pastepile exposes permanent pastes only to keyless or eligible
paid requests.
