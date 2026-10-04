import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { installEventTreeDotBehaviorPatch } from './app/gojs/event-tree/event-tree-dot-behavior.patch';
import { installEventTreeHeaderDragPatch } from './app/gojs/event-tree/event-tree-header-drag.patch';
import { installEventTreeSequenceSelectionPatch } from './app/gojs/event-tree/event-tree-sequence-selection.patch';
import { installEventTreeResultsResizePatch } from './app/gojs/event-tree/event-tree-results-resize.patch';

installEventTreeDotBehaviorPatch();
installEventTreeHeaderDragPatch();
installEventTreeSequenceSelectionPatch();
installEventTreeResultsResizePatch();

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  console.error('NextPSA bootstrap failed', error);
});
