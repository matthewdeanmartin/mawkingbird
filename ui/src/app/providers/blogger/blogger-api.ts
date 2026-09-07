import { inject, Injectable } from '@angular/core';
import { BloggerSession, googleError } from './blogger-session';

const API_BASE = 'https://www.googleapis.com/blogger/v3';

/** One of the user's blogs, trimmed to what the picker and composer need. */
export interface BloggerBlog {
  id: string;
  name: string;
  url: string;
}

/** A published (or drafted) post, as Blogger echoes it back. */
export interface BloggerPost {
  id: string;
  title: string;
  /** Public permalink. Absent for a draft — it has no address yet. */
  url?: string;
  published?: string;
}

interface BlogListResponse {
  items?: { id: string; name: string; url: string }[];
}

/**
 * Blogger v3, called straight from the browser.
 *
 * **No CORS proxy.** Unlike Mataroa — which needs one, and needs the user to
 * consent to it — `www.googleapis.com` answers preflight with a permissive
 * `Access-Control-Allow-Origin` and allows the `Authorization` header, so the
 * request goes direct. That is worth stating explicitly because the surrounding
 * connectors all assume the opposite, and routing a Google OAuth token through
 * a third-party proxy would hand that proxy the ability to publish as the user.
 *
 * Everything here needs a user token; the Blogger API key some builds carry can
 * only read *public* blogs and is refused (403) for `users/self/blogs` and for
 * any write, so it is not a fallback.
 */
@Injectable({ providedIn: 'root' })
export class BloggerApi {
  private session = inject(BloggerSession);

  /** The blogs this Google account can post to. */
  async listBlogs(): Promise<BloggerBlog[]> {
    const body = await this.request<BlogListResponse>(
      'GET',
      `${API_BASE}/users/self/blogs`,
      undefined,
      "Couldn't load your Blogger blogs.",
    );
    return (body.items ?? []).map((blog) => ({ id: blog.id, name: blog.name, url: blog.url }));
  }

  /**
   * Publish a post, or file it as a draft.
   *
   * `content` is HTML — Blogger stores and renders it as such. Callers pass
   * rendered markup, never raw user text, or a stray `<` silently truncates the
   * post.
   */
  async createPost(options: {
    blogId: string;
    title: string;
    content: string;
    isDraft?: boolean;
  }): Promise<BloggerPost> {
    const url = new URL(`${API_BASE}/blogs/${encodeURIComponent(options.blogId)}/posts`);
    if (options.isDraft) {
      url.searchParams.set('isDraft', 'true');
    }
    return this.request<BloggerPost>(
      'POST',
      url.toString(),
      { kind: 'blogger#post', title: options.title, content: options.content },
      options.isDraft ? "Couldn't save the draft to Blogger." : "Couldn't publish to Blogger.",
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    url: string,
    body: unknown,
    fallbackError: string,
  ): Promise<T> {
    const token = this.session.accessToken();
    if (!token) {
      throw new Error('Connect Blogger in Settings first.');
    }
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      // 401 means the token is gone or revoked; drop it so the UI stops
      // claiming a connection that no longer exists. 403 is different — the
      // token is fine, the *scope* or the blog's permissions are not — so the
      // connection stays and the message explains.
      if (response.status === 401) {
        this.session.disconnect();
      }
      throw new Error(await googleError(response, fallbackError));
    }
    return (await response.json()) as T;
  }
}
