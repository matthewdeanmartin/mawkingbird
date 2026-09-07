import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { logBuildDiagnostics } from './app/build-diagnostics';

logBuildDiagnostics();
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
