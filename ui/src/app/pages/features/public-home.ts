import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-public-home',
  imports: [RouterLink],
  styleUrl: './features.css',
  template: `
    <main class="features" lang="en">
      <header>
        <strong>Mawkingbird</strong>
      </header>
      <div class="intro">
        <div>
          <p class="eyebrow">Your feeds. Your reading. Your words.</p>
          <h1>Mastodon, Bluesky and RSS in one familiar home</h1>
          <p>
            A browser client for your social feeds, reading list and writing. Try the app preview,
            or connect your own account.
          </p>
          <a class="open-app" routerLink="/anonymous">Browse anonymously</a>
          <a routerLink="/login">Sign in</a>
        </div>
        <img src="mockingbird_hand.png" width="360" height="252" alt="The hand-drawn Mawkingbird" />
      </div>
      <section>
        <h2>Core Mastodon features</h2>
        <p>
          Read timelines, follow tags and lists, join conversations and discover people with starter
          collections.
        </p>
        <h2>Readability features</h2>
        <p>Follow RSS, keep bookmarks and open supported articles in a focused reading view.</p>
        <h2>Creators: writing and drafts</h2>
        <p>Keep your ideas in drafts and use writing and publishing tools when enabled.</p>
        <h2>Advanced user features</h2>
        <p>Manage accounts with bulk actions, third-party connections and network diagnostics.</p>
      </section>
      <footer>
        <a routerLink="/features">Discover Mawkingbird features</a>
      </footer>
    </main>
  `,
})
export class PublicHome {}
