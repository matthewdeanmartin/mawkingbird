import { InjectionToken } from '@angular/core';

/** The open surface a menu row belongs to; rows ask it to close after a command. */
export interface MbMenuSurface {
  close(restoreFocus?: boolean): void;
}

export const MB_MENU_SURFACE = new InjectionToken<MbMenuSurface>('MB_MENU_SURFACE');
