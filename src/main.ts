import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { installEventTreeDotBehaviorPatch } from './app/gojs/event-tree/event-tree-dot-behavior.patch';
import { installEventTreeHeaderDragPatch } from './app/gojs/event-tree/event-tree-header-drag.patch';
import { installEventTreeSequenceSelectionPatch } from './app/gojs/event-tree/event-tree-sequence-selection.patch';
import { installEventTreeResultsResizePatch } from './app/gojs/event-tree/event-tree-results-resize.patch';
import { installEventTreeTagPalettePatch } from './app/gojs/event-tree/event-tree-tag-palette.patch';
import { installEventTreeBrowserWidthPatch } from './app/features/event-tree/event-tree-browser-width.patch';
import { installEventTreeViewportPatch } from './app/gojs/event-tree/event-tree-viewport.patch';
import { installEventTreeBodyDensityPatch } from './app/gojs/event-tree/event-tree-body-density.patch';
import { installEventTreeBranchContextMenuPatch } from './app/gojs/event-tree/event-tree-branch-context-menu.patch';
import { installEventTreeForwardSelectionPatch } from './app/gojs/event-tree/event-tree-forward-selection.patch';

installEventTreeDotBehaviorPatch();
installEventTreeHeaderDragPatch();
installEventTreeSequenceSelectionPatch();
installEventTreeResultsResizePatch();
installEventTreeTagPalettePatch();
installEventTreeBrowserWidthPatch();
installEventTreeViewportPatch();
installEventTreeBodyDensityPatch();
installEventTreeBranchContextMenuPatch();
installEventTreeForwardSelectionPatch();

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  console.error('NextPSA bootstrap failed', error);
});
