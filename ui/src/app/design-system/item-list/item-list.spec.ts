import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { MbItemList, MbItemMeta, MbItemPicture, MbItemRow, MbItemTitle } from './item-list';

@Component({
  imports: [RouterLink, MbItemList, MbItemMeta, MbItemPicture, MbItemRow, MbItemTitle],
  template: `
    <ol mbItemList>
      <li mbItemRow>
        <button type="button">Remove</button>
        <span mbItemMeta>YouTube</span>
        @if (true) {
          <a mbItemTitle routerLink="/watch">Lamps</a>
        } @else {
          <span mbItemTitle>Lamps</span>
        }
        <mb-item-picture link="/watch" src="data:," />
      </li>
    </ol>
  `,
})
class Host {}

describe('MbItemRow', () => {
  it('orders picture, title, meta and actions, and keeps the picture out of the Tab order', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const row: HTMLElement = fixture.nativeElement.querySelector('li');
    expect(
      [...row.querySelectorAll('mb-item-picture a, [mbItemTitle], [mbItemMeta], button')].map(
        (el) => el.tagName,
      ),
    ).toEqual(['A', 'A', 'SPAN', 'BUTTON']);
    const picture = row.querySelector('mb-item-picture a')!;
    expect(picture.getAttribute('aria-hidden')).toBe('true');
    expect(picture.getAttribute('tabindex')).toBe('-1');
    expect(picture.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(row.querySelector('a[mbItemTitle]')?.getAttribute('href')).toBe('/watch');
  });
});
