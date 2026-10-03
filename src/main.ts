import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { installEventTreeDotBehaviorPatch } from './app/gojs/event-tree/event-tree-dot-behavior.patch';

installEventTreeDotBehaviorPatch();

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  console.error('NextPSA bootstrap failed', error);
});
