# Connect an existing Hugo blog

Use this connection if you already have a Hugo blog in a GitHub repository. Creating or hosting a new site is outside this user guide.

## Prepare access

In GitHub, create a fine-grained personal access token for only the blog repository. Give it **Contents: Read and write** so Mawkingbird can publish. The connection page also asks for read-only access to Actions so it can report build status.

## Connect

1. Open **Settings → Connections → Blog (Hugo)**.
2. Paste the **GitHub token**.
3. Enter the repository as `owner/repository` or paste its GitHub address.
4. Enter the branch used to publish the site.
5. Enter the folder where posts live, often `content/posts`.
6. Optionally enter the public site address.
7. Choose **Save and check repository**.

After the check succeeds, the connection page can list posts in that folder. Choose **Edit** beside a post to open it in Mawkingbird.

## Read the blog in Mawkingbird

Turn on **Include my blog's posts on my profile** to add published posts to your profile feed.

Choose **Add my blog to my home timeline** to follow its public feed yourself. A public site address is required for these choices.

The **Record interactions on my blog** option requires extra preparation outside ordinary use. Leave it off unless your site is already set up for it.

## Disconnect

Choose **Disconnect**, then revoke the repository token in GitHub when you no longer need it.

Related: [Publish to a blog](blogs.md).
