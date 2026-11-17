import { Injectable, signal } from '@angular/core';
import { BlogAuthor } from './blog-source';

/**
 * Which blog, and which post of it, the page in front of the reader shows.
 *
 * Blog pages set it; the shell rails read it, because the rail widgets for
 * Blog (about the author, more from this blog) are about the page rather
 * than about the app. Pages clear it when they go.
 */
@Injectable({ providedIn: 'root' })
export class BlogContext {
  readonly author = signal<BlogAuthor | null>(null);
  /** The open post's id on the author's server, or null on the blog list. */
  readonly postId = signal<string | null>(null);

  show(author: BlogAuthor | null, postId: string | null = null): void {
    this.author.set(author);
    this.postId.set(postId);
  }

  clear(): void {
    this.show(null);
  }
}
