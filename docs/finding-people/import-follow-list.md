# Import a follow list

Use Import Friends when you already have several Mastodon handles or a follow-list file. Mawkingbird looks up and follows the accounts one at a time.

## Prepare the list

You can use:

- full Mastodon handles, one per line;
- Mastodon profile addresses, one per line;
- a Mastodon-compatible `following_accounts.csv` file;
- a plain text file containing handles or profile addresses.

A full handle looks like `@name@server.example`.

## Preview and import

1. Open **More → Settings**.
2. Choose **Import/Export Friends & Tags**.
3. Under **Import Friends**, paste the list or choose **Upload CSV**.
4. Choose **Preview**.
5. Review the parsed accounts and number of entries.
6. Choose **Follow all** only when the preview is correct.

Mawkingbird shows progress as it looks up and follows each account. You can choose **Stop** to prevent the remaining entries from being processed. Follows already completed are not undone.

## Review the result

Some entries may already be followed, require approval, have moved, or no longer exist. Read the status beside each row rather than assuming the whole file succeeded.

## Anonymous imports

Import Friends is available while browsing anonymously. In that case, successful follows are saved in the current browser rather than sent from a social account. They will not appear on another device and may be lost if browser data is cleared.

Sign in before importing when you want the follows attached to your Mastodon account.

Next: [Look for people from your contacts](contacts.md).
