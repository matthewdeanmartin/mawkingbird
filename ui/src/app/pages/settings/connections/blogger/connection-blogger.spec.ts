import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BloggerApi } from '../../../../providers/blogger/blogger-api';
import { BloggerSession } from '../../../../providers/blogger/blogger-session';
import { ConnectionBlogger } from './connection-blogger';

describe('Blogger shared blog choice', () => {
  const blogId = signal<string | null>(null);
  const chooseBlog = vi.fn((id: string) => blogId.set(id));
  beforeEach(() => {
    blogId.set(null);
    chooseBlog.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: BloggerSession,
          useValue: {
            configured: true,
            connected: () => true,
            blogId,
            blogName: () => null,
            ownClientId: () => '',
            hasShippedClientId: true,
            chooseBlog,
          },
        },
        {
          provide: BloggerApi,
          useValue: {
            listBlogs: async () => [
              { id: 'one', name: 'First', url: 'https://example.test/one' },
              { id: 'two', name: 'Second', url: 'https://example.test/two' },
            ],
          },
        },
      ],
    });
  });

  it('selects exactly one blog without repeating the write when already selected', async () => {
    const fixture = TestBed.createComponent(ConnectionBlogger);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const radios = fixture.nativeElement.querySelectorAll(
      'mb-radio-group input',
    ) as NodeListOf<HTMLInputElement>;
    expect(radios.length).toBe(2);
    radios[0].click();
    fixture.detectChanges();
    expect(chooseBlog).toHaveBeenCalledWith('one', 'First', 'https://example.test/one');
    radios[0].click();
    expect(chooseBlog).toHaveBeenCalledOnce();
    radios[1].click();
    fixture.detectChanges();
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
  });
});
