import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalCompose } from './local-compose';
import { LocalPostStore } from './local-post-store';
import { Auth } from '../auth';
import { Status } from '../models';

describe('LocalCompose', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
  });

  function create(inReplyTo: string | null = null) {
    const fixture = TestBed.createComponent(LocalCompose);
    fixture.componentRef.setInput('inReplyTo', inReplyTo);
    fixture.detectChanges();
    return fixture;
  }

  it('posts a top-level practice post through the store and emits it', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as { text: string; submit(e: Event): void };
    const emitted: Status[] = [];
    fixture.componentInstance.posted.subscribe((s) => emitted.push(s));

    cmp.text = 'hello';
    cmp.submit(new Event('submit'));

    expect(emitted.length).toBe(1);
    expect(emitted[0].in_reply_to_id).toBeNull();
    // Just the viewer's post: Eliza no longer answers practice posts.
    expect(TestBed.inject(LocalPostStore).posts().length).toBe(1);
    // Input cleared after submit.
    expect(cmp.text).toBe('');
  });

  it('posts a reply when inReplyTo is set', () => {
    const fixture = create('eliza:post:welcome');
    const cmp = fixture.componentInstance as unknown as { text: string; submit(e: Event): void };
    const emitted: Status[] = [];
    fixture.componentInstance.posted.subscribe((s) => emitted.push(s));

    cmp.text = 'thanks';
    cmp.submit(new Event('submit'));

    expect(emitted[0].in_reply_to_id).toBe('eliza:post:welcome');
  });

  it('does nothing on blank input', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as { text: string; submit(e: Event): void };
    const emitted: Status[] = [];
    fixture.componentInstance.posted.subscribe((s) => emitted.push(s));

    cmp.text = '   ';
    cmp.submit(new Event('submit'));

    expect(emitted.length).toBe(0);
    expect(TestBed.inject(LocalPostStore).posts().length).toBe(0);
  });
});
