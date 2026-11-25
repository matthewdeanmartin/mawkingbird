import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WatchQueue } from './watch-queue';

const id = (letter: string) => letter.repeat(11);
const video = (letter: string) => ({
  key: 'youtube:' + id(letter),
  title: letter,
  params: { youtube: id(letter) },
});

describe('WatchQueue as a playlist', () => {
  let queue: WatchQueue;
  beforeEach(() => {
    localStorage.clear();
    queue = TestBed.inject(WatchQueue);
    for (const letter of ['a', 'b', 'c']) queue.add(video(letter));
  });
  const titles = () => queue.items().map((item) => item.title);

  it('walks forward and back over the same videos', () => {
    expect(queue.advance(video('a'))?.title).toBe('b');
    expect(queue.advance(video('b'))?.title).toBe('c');
    expect(titles()).toEqual(['c']);

    expect(queue.goBack(video('c'))?.title).toBe('b');
    expect(queue.goBack(video('b'))?.title).toBe('a');
    expect(queue.previous()).toBeNull();
    expect(titles()).toEqual(['b', 'c']);
    expect(queue.advance(video('a'))?.title).toBe('b');
  });

  it('has nothing previous until something was played, and forgets it on clear', () => {
    expect(queue.goBack(video('a'))).toBeNull();
    queue.advance(video('a'));
    expect(queue.previous()?.title).toBe('a');
    queue.clear();
    expect(queue.previous()).toBeNull();
  });

  it('keeps what was watched out of storage', () => {
    queue.advance(video('a'));
    expect(JSON.stringify(localStorage)).not.toContain(id('a'));
  });
});
