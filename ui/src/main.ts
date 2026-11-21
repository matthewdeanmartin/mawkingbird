import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { logBuildDiagnostics } from './app/platform/diagnostics/build-diagnostics';
import { retireBlueskyAppPasswords } from './app/connections/bluesky/bluesky-app-password-retirement';

logBuildDiagnostics();
// Before anything reads the Bluesky keys: app passwords are retired, and a
// link that still used one now asks for Bluesky's own sign-in.
try {
  retireBlueskyAppPasswords();
} catch {
  // Blocked storage: nothing stored to retire.
}
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
