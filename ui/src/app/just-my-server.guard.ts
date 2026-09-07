import { inject } from '@angular/core';
import { CanActivateChildFn, CanDeactivateFn } from '@angular/router';
import { JustMyServer } from './just-my-server';

/** Keep an in-progress list synchronization alive by blocking in-app navigation. */
export const justMyServerUpdateGuard: CanActivateChildFn = () => !inject(JustMyServer).updating();

/** Also block routes that would remove the entire application shell. */
export const justMyServerUpdateCanDeactivate: CanDeactivateFn<unknown> = () =>
  !inject(JustMyServer).updating();
