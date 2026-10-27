import { describe, expect, it } from 'vitest';
import { hasHumanQuestion, plainText } from './question';

describe('hasHumanQuestion', () => {
  it.each([
    '<p>Anyone tried the new release?</p>',
    '<p>Is this right? I think so.</p>',
    '<p>What’s next?</p>',
    '<p>¿Qué opinas?</p>',
    '<p>Как дела?</p>',
    '<p>これは何ですか？教えて</p>',
    '<p>Thoughts?<br>Asking for a friend</p>',
  ])('finds the question in %s', (html) => {
    expect(hasHumanQuestion(html)).toBe(true);
  });

  it.each([
    '<p>No question here.</p>',
    // A query string in a link is not a question (MIMB drops URLs first).
    '<p>Read <a href="https://a.example/x?y=1">https://a.example/x?y=1</a></p>',
    '<p>https://a.example/page? is a link</p>',
    '<p>??? </p>',
    '<p>Spacing ? alone</p>',
  ])('finds none in %s', (html) => {
    expect(hasHumanQuestion(html)).toBe(false);
  });
});

describe('plainText', () => {
  it('drops tags, decodes entities and removes URLs', () => {
    const text = plainText('<p>a &amp; b&#39;s &#x41; <a href="x">https://e.example/q?x</a></p>');
    expect(text.replace(/\s+/g, ' ').trim()).toBe("a & b's A");
  });
});
