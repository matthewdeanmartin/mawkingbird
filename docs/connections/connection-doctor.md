# Check a connection with Connection Doctor

Connection Doctor checks whether your current browser and network can reach services Mawkingbird may use. Run it before opening a paid account or buying credits for a connection.

The check uses public addresses. It does not need a login or key and does not use credentials you already saved.

## Run the check

1. Open **Settings → Connections**.
2. Choose **Check what this network allows**.
3. Choose **Check all connections**.
4. Wait for the summary and review the service you care about.

Results may say that a service works, needs a proxy, or is blocked or unreachable.

## If the control check fails

Treat the other results as unreliable. Your browser may be offline, or the network or an extension may be blocking all checks. Confirm that an ordinary website opens, then choose **Check again**.

## If one service fails

1. Check the service's status-page link when one is available.
2. Choose **Open _host_ in a tab**.
3. Report what the tab shows: a human check, block page, security warning, missing server, timeout, or something else.
4. Read the interpretation Mawkingbird provides.

A successful page load does not always mean Mawkingbird can read the service. The result may tell you that a [CORS proxy](cors-proxy.md) is needed.

Do not install an extension that disables browser security checks just to make a connection work. Such an extension can affect unrelated sites you visit, including mail and banking sites.

## Results can change

Run the check again after changing networks, disabling a suspected blocker, configuring a proxy, or waiting out a service outage. A result describes this browser on this network at that moment.

Related: [Connections](index.md).
