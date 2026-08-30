# Connect GitHub

The GitHub connection is read-only. It can help you find the Mastodon or Bluesky profiles of people you follow on GitHub and show your unread GitHub notifications.

## Connect

1. Open **Settings → Connections → GitHub**.
2. Follow **Create a classic personal access token**.
3. In GitHub, grant only `notifications` and `read:user`.
4. Copy the token, return to Mawkingbird, and paste it into **GitHub token**.
5. Choose **Connect GitHub**.

The token can read your GitHub notifications. Use this connection only in a browser profile and on a device you trust.

## Check the connection

Choose **Run API proof**. A successful result reports how many unread notifications and followed accounts Mawkingbird could read.

To look for the same people elsewhere, follow **Find GitHub friends** from the connection page. Review every match before following; similar usernames do not prove that two profiles belong to the same person.

## Disconnect

Choose **Disconnect** on the GitHub connection page. Then revoke the token in GitHub's token settings if you are finished with it.

The separate [GitHub Gist connection](github-gist.md) can publish and edit pastes. Connecting one does not connect the other.

Related: [Find people to follow](../finding-people/find-people.md).
