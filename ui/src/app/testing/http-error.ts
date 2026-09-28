// Storybook lives outside ui/node_modules. Resolve this secondary Angular entry
// point from the UI workspace, keeping real HttpErrorResponse identity for guards.
export { HttpErrorResponse } from '@angular/common/http';
