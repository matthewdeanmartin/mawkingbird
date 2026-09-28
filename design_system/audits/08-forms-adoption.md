# Sprint 8 adoption audit

## Production consumers

Paths below are relative to `ui/src/app/`.

| Consumer                                             | Adopted controls                                           | Count |
| ---------------------------------------------------- | ---------------------------------------------------------- | ----- |
| `pages/login/login.html`                             | Registration agreement checkbox                            | 1     |
| `admin/announcements/admin-announcements.html`       | Announcement textarea and create button                    | 2     |
| `admin/domains/admin-domains.html`                   | Domain input, moderation select and create button          | 3     |
| `admin/domain-allows/admin-domain-allows.html`       | Domain input and create button                             | 2     |
| `admin/email-blocks/admin-email-blocks.html`         | Email-domain input and create button                       | 2     |
| `admin/ip-blocks/admin-ip-blocks.html`               | IP and comment inputs, moderation select and create button | 4     |
| `admin/canonical-blocks/admin-canonical-blocks.html` | Hash and test-email inputs, create and lookup buttons      | 4     |
| Total                                                | Ten fields, seven buttons and one checkbox                 | 18    |

The six create error regions and canonical lookup error region are feedback,
not additional adopted controls. Sprint 7's publish checkbox is not counted again.

## Behavior and styling

Native input types, ngModel, existing option values, payloads, trimming, consent
guards and Enter handlers are retained. Failed writes preserve the entered value.
Canonical lookup now has pending/error state, blocks duplicate pending requests
and clears a stale result on the next attempt. These are explicit recovery fixes.

Removed duplicate input/select rules from five list-form stylesheets, the
announcement textarea rules and Login agreement alignment rules. New
`admin/admin-form.css` controls external flex layout and spacing only; widgets
own their labels, controls, focus, disabled state and error presentation.

Three source translation keys were added: `adminForms.severity`,
`adminForms.saveFailed` and `adminForms.testFailed`. Existing translations remain;
no starter-pack language or script tags changed.

## Evidence and remaining debt

Six actual admin components are exercised using local Storybook fixtures. The
consent preview is isolated; the real Login Angular test verifies registration
requires agreement and sends it in the account request. Targeted HTTP tests cover
payloads, duplicate requests, failed saves and retries. Browser tests cover the
rendered fields and light/dim, narrow/wide and RTL layouts. Full gate outcomes are
recorded in [review notes](../REVIEW-8.md).

The regenerated lexical inventory covers 1,052 source files and still identifies
205 candidate files. These are search findings, not adoption percentages. A file
can retain candidates after its create form migrates: row remove/publish controls,
list loading states and other Login controls remain open semantic review work.
They are not permanent approved exceptions. No directory-wide exemption was added.
