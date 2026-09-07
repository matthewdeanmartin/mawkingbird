import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BloggerApi, BloggerBlog } from '../../../../providers/blogger/blogger-api';
import {
  BLOGGER_CALLBACK_PATH,
  BloggerSession,
} from '../../../../providers/blogger/blogger-session';
import { appCallbackUrl } from '../../../../pkce';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { PageDiagnostics } from '../../../../page-diagnostics';

// i18n settings.connections.blogger.error.authFailed: Blogger authorization failed.
// i18n settings.connections.blogger.notice.connected: Connected to Google. Choose which blog to publish to.
// i18n settings.connections.blogger.error.signInFailed: Couldn't start Google sign-in.
// i18n settings.connections.blogger.error.noBlogs: This Google account has no Blogger blogs. Create one at blogger.com, then reload.
// i18n settings.connections.blogger.error.loadBlogsFailed: Couldn't load your blogs.
// i18n settings.connections.blogger.notice.postsWillPublish: Posts will publish to {{name}}.
// i18n settings.connections.blogger.notice.savedOwnProject: Saved. Sign in again to use your own Google project.
// i18n settings.connections.blogger.notice.clearedOwnProject: Cleared. Signing in will use this app's own Google project.
// i18n settings.connections.blogger.notice.signedOut: Signed out of Google. Your blog is still shown on your profile.
// i18n settings.connections.blogger.notice.forgotten: Disconnected from Blogger and removed the blog.

/**
 * Settings → Connections → Blog (Blogger).
 *
 * Two steps, and the second is not optional: signing in with Google proves who
 * you are, but a Google account can own several blogs, so nothing can be
 * published until one is chosen. The composer keys off that choice rather than
 * the session, so a half-finished setup never presents a target that would fail
 * on send.
 */
// i18n settings.connections.blogger.back: ‹ All connections
// i18n settings.connections.blogger.chooseBlog: Choose a blog before posting — nothing can publish until you do.
// i18n settings.connections.blogger.forget: Forget this blog
// i18n settings.connections.blogger.intro: Publish posts to a Google Blogger blog from the composer, live or as a draft. This is separate from the Mataroa connector — both can be connected, and the composer offers whichever are.
// i18n settings.connections.blogger.loading: Loading…
// i18n settings.connections.blogger.notConfigured: Blogger has not been configured for this build. It needs a Google OAuth client id — either from whoever built this copy, or your own, below.
// i18n settings.connections.blogger.own.bloggerApi: Blogger API
// i18n settings.connections.blogger.own.clientIdLabel: Your OAuth client id
// i18n settings.connections.blogger.own.console: Google Cloud console ↗
// i18n settings.connections.blogger.own.inUse: Using your own Google project.
// i18n settings.connections.blogger.own.intro: Optional. This app ships with a shared Google project, which is enough for most people. Bring your own if you hit its limits — Google caps an unverified app at 100 users, and everyone using the shared project shares its Blogger quota. Your own project also skips the unverified-app warning, since you own it.
// i18n settings.connections.blogger.own.redirectUris: Authorized redirect URIs
// i18n settings.connections.blogger.own.step1.a: In the
// i18n settings.connections.blogger.own.step1.b: , create a project and enable the
// i18n settings.connections.blogger.own.step2.a: Create an OAuth client id of type
// i18n settings.connections.blogger.own.step3.a: Add this exact address to its
// i18n settings.connections.blogger.own.step4: Paste the client id below. The client secret is not needed — leave it in Google.
// i18n settings.connections.blogger.own.title: Use my own Google project
// i18n settings.connections.blogger.own.webApplication: Web application
// i18n settings.connections.blogger.permissionNote: Signing in grants this app permission to read and publish to your Blogger blogs. The permission lasts until you close this tab — nothing is stored long-term, so you will sign in again next session. Google may warn that this app is unverified; that is about Google's review process, not about what the app does.
// i18n settings.connections.blogger.postsGoTo.a: Posts go to
// i18n settings.connections.blogger.postsGoTo.b: . Pick another below to change it.
// i18n settings.connections.blogger.profile.corsProxy: CORS proxy
// i18n settings.connections.blogger.profile.hint.a: Your published blog posts appear alongside your Mawkingbird posts on your own profile. Reads the blog's public RSS feed through your
// i18n settings.connections.blogger.profile.hint.b: , which Blogger's feed requires.
// i18n settings.connections.blogger.profile.include: Include my blog's posts in my profile feed
// i18n settings.connections.blogger.profile.title: On your profile
// i18n settings.connections.blogger.publishTo: Publish to
// i18n settings.connections.blogger.refreshBlogs: Refresh blog list
// i18n settings.connections.blogger.save: Save
// i18n settings.connections.blogger.signInWithGoogle: Sign in with Google
// i18n settings.connections.blogger.signOut: Sign out
// i18n settings.connections.blogger.signedIn: Signed in to Google
// i18n settings.connections.blogger.step.choose: Choose which of that account's blogs to publish to.
// i18n settings.connections.blogger.step.post: Pick the blog as the destination in the composer, then post.
// i18n settings.connections.blogger.step.signIn: Sign in with the Google account that owns the blog.
// i18n settings.connections.blogger.stillRemembered: is still remembered. Its public posts keep appearing on your profile if you enabled that; sign in again to publish.
// i18n settings.connections.blogger.title: ✍️ Blog (Blogger)

// i18n settings.connections.blogger.unverified: Google may warn that <strong>“Google hasn't verified this app”</strong> before asking for permission. That refers to Google's review of this app, not to anything being wrong with it; continue past it via <em>Advanced</em>. Using your own Google project, below, removes the warning entirely.

@Component({
  selector: 'app-connection-blogger',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './connection-blogger.html',
  styleUrls: ['../connection-page.css', './connection-blogger.css'],
})
export class ConnectionBlogger implements OnInit {
  protected readonly session = inject(BloggerSession);
  private readonly api = inject(BloggerApi);
  private readonly route = inject(ActivatedRoute);
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly transloco = inject(TranslocoService);

  protected readonly blogs = signal<BloggerBlog[]>([]);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.account.detail;

  /** Draft of the "use my own Google project" field. */
  protected readonly clientIdDraft = signal('');
  /** The advanced section stays closed unless it is already in use. */
  protected readonly showAdvanced = signal(false);
  /** Where the user must register the callback on their own OAuth client. */
  protected readonly callbackUrl = appCallbackUrl(BLOGGER_CALLBACK_PATH);

  ngOnInit(): void {
    this.clientIdDraft.set(this.session.ownClientId());
    // Already using an override, or no shipped id to fall back on — either way
    // the advanced section is the relevant part of this page, so open it.
    this.showAdvanced.set(!!this.session.ownClientId() || !this.session.hasShippedClientId);

    // The OAuth callback bounces back here with its outcome in the query.
    const params = this.route.snapshot.queryParamMap;
    if (params.get('blogger') === 'error') {
      this.error.set(
        params.get('message') ??
          this.transloco.translate('settings.connections.blogger.error.authFailed'),
      );
    } else if (params.get('blogger') === 'connected') {
      this.notice.set(this.transloco.translate('settings.connections.blogger.notice.connected'));
    }
    if (this.session.connected()) {
      void this.loadBlogs();
    }
  }

  async connect(): Promise<void> {
    this.error.set(null);
    try {
      await this.session.connect();
    } catch (error: unknown) {
      this.diagnostics.error('Blogger', 'connect:error', error);
      this.error.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('settings.connections.blogger.error.signInFailed'),
      );
    }
  }

  async loadBlogs(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const blogs = await this.api.listBlogs();
      this.blogs.set(blogs);
      if (!blogs.length) {
        this.error.set(this.transloco.translate('settings.connections.blogger.error.noBlogs'));
      }
    } catch (error: unknown) {
      this.diagnostics.error('Blogger', 'load-blogs:error', error);
      this.error.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('settings.connections.blogger.error.loadBlogsFailed'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  choose(blog: BloggerBlog): void {
    this.session.chooseBlog(blog.id, blog.name, blog.url);
    this.notice.set(
      this.transloco.translate('settings.connections.blogger.notice.postsWillPublish', {
        name: blog.name,
      }),
    );
  }

  toggleIncludeInProfile(include: boolean): void {
    this.session.setIncludeInProfile(include);
  }

  saveClientId(): void {
    const next = this.clientIdDraft().trim();
    this.session.setOwnClientId(next);
    this.blogs.set([]);
    this.error.set(null);
    this.notice.set(
      this.transloco.translate(
        next
          ? 'settings.connections.blogger.notice.savedOwnProject'
          : 'settings.connections.blogger.notice.clearedOwnProject',
      ),
    );
  }

  disconnect(): void {
    // Signs out of Google but keeps the blog choice and profile-feed opt-in:
    // the feed is public and needs no session, so signing out should stop
    // publishing, not empty the user's profile.
    this.session.disconnect();
    this.blogs.set([]);
    this.notice.set(this.transloco.translate('settings.connections.blogger.notice.signedOut'));
  }

  forget(): void {
    this.session.forget();
    this.blogs.set([]);
    this.notice.set(this.transloco.translate('settings.connections.blogger.notice.forgotten'));
  }
}
