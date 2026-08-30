# Control how long connections stay saved

Some connections ask you to paste a key or app password. Mawkingbird can forget supported saved credentials automatically.

Open **Settings → Connections**, then find **How long to keep credentials**. Choose the length of time that fits the device you are using.

- Choose a shorter time on a shared or temporary device.
- Choose a longer time on a private device if reconnecting often would be inconvenient.
- Choose **Never** only when you are comfortable revoking access yourself later.

The timer starts again when you reconnect. Dropbox manages its own short-lived sign-in and is not controlled by this choice.

## When time runs out

A browser-only connection is disconnected and its saved credential is removed. A protected, synchronized credential may instead become locked until it is needed again. The badge on each connection card explains where that connection is kept.

## Revoke access completely

Disconnect the service in Mawkingbird, then open that service's own security or connected-app settings and revoke the key, app password, or permission. Revoking it at the service prevents an old copy from being used anywhere.

Never send a credential in a post, profile, support message, or bug report.

Related: [Connections](index.md) and [Connection Doctor](connection-doctor.md).
