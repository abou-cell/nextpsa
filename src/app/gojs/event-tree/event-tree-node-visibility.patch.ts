import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const ACTION_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH']);
const HIDDEN_SIZE = 1.5;
const HOVER_SIZE = 6;
const SELECTED_SIZE = 8;

/**
 * Final visual authority for ET branch-point nodes.
 *
 * Branch points are intentionally invisible at rest. The large transparent
 * HIT_AREA installed by the dot-behaviour patch remains pickable, so users can
 * still discover a point by hovering it. A point becomes visible only while it
 * is hovered or while it belongs to the current logical branch selection.
 *
 * This patch is installed last because several legacy ET patches still resize
 * or recolour DOT shapes. We keep those behaviours, but own opacity and the
 * final visible size so Standard/Centred layout changes and selection/tagging
 * refreshes cannot make all nodes permanently visible again.
 */
export function installEventTreeNodeVisibilityPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeNodeVisibilityPatchInstalled) return;
  prototype.__eventTreeNodeVisibilityPatchInstalled = true;

  const originalInstallTemplates = prototype.installTemplates;
  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const selectedBranchKeys = (component: any): Set<string> =>
    (component.__eventTreeSelectedBranchKeys as Set<string> | undefined) ?? new Set<string>();

  const isLogicallySelected = (component: any, node: go.Node): boolean => {
    const key = String((node.data as any)?.key ?? '');
    if (!key) return false;
    if (selectedBranchKeys(component).has(key)) return true;
    const activeKey = component.selectedBranchKey?.() as string | null | undefined;
    return activeKey === key || node.isSelected;
  };

  const renderNode = (component: any, node: go.Node): void => {
    const data = node.data as any;
    if (!ACTION_CATEGORIES.has(String(data?.category))) return;

    const dot = node.findObject('DOT') as go.Shape | null;
    if (!dot) return;

    const hovered = Boolean((node as any).__eventTreeNodeHovered);
    const selected = isLogicallySelected(component, node);
    const visible = hovered || selected;

    dot.opacity = visible ? 1 : 0;
    const size = selected ? SELECTED_SIZE : hovered ? HOVER_SIZE : HIDDEN_SIZE;
    dot.width = size;
    dot.height = size;
  };

  const renderAll = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    diagram.nodes.each((node: go.Node) => renderNode(component, node));
    diagram.requestUpdate();
  };

  // Run after all older two/three-frame ET render queues.
  const scheduleRender = (component: any): void => {
    const epoch = Number(component.__eventTreeNodeVisibilityEpoch ?? 0) + 1;
    component.__eventTreeNodeVisibilityEpoch = epoch;
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (component.__eventTreeNodeVisibilityEpoch !== epoch) return;
      renderAll(component);
    }))));
  };

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    ACTION_CATEGORIES.forEach((category) => {
      const template = diagram.nodeTemplateMap.get(category) as go.Node | null;
      if (!template) return;

      const dot = template.findObject('DOT') as go.Shape | null;
      if (dot) {
        dot.opacity = 0;
        dot.width = HIDDEN_SIZE;
        dot.height = HIDDEN_SIZE;
      }

      const previousEnter = template.mouseEnter;
      const previousLeave = template.mouseLeave;
      const previousClick = template.click;

      template.mouseEnter = (event: go.InputEvent, object: go.GraphObject): void => {
        previousEnter?.(event, object);
        const node = object.part as go.Node | null;
        if (!node) return;
        (node as any).__eventTreeNodeHovered = true;
        renderNode(this, node);
      };

      template.mouseLeave = (event: go.InputEvent, object: go.GraphObject): void => {
        previousLeave?.(event, object);
        const node = object.part as go.Node | null;
        if (!node) return;
        (node as any).__eventTreeNodeHovered = false;
        renderNode(this, node);
      };

      template.click = (event: go.InputEvent, object: go.GraphObject): void => {
        previousClick?.(event, object);
        // Branch selection is maintained by the authoritative selection patch.
        // Re-evaluate every point so a previous branch disappears immediately
        // when a new non-additive branch is selected.
        scheduleRender(this);
      };
    });
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    scheduleRender(this);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;

    const interactionRefresh = (): void => scheduleRender(this);
    this.__eventTreeNodeVisibilityInteractionRefresh = interactionRefresh;
    div?.addEventListener('click', interactionRefresh, true);
    div?.addEventListener('contextmenu', interactionRefresh, true);

    const changedSelection = (): void => scheduleRender(this);
    const layoutCompleted = (): void => scheduleRender(this);
    this.__eventTreeNodeVisibilityChangedSelection = changedSelection;
    this.__eventTreeNodeVisibilityLayoutCompleted = layoutCompleted;
    this.diagram?.addDiagramListener('ChangedSelection', changedSelection);
    this.diagram?.addDiagramListener('LayoutCompleted', layoutCompleted);

    scheduleRender(this);
  };

  prototype.ngOnDestroy = function(): void {
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (this.__eventTreeNodeVisibilityInteractionRefresh) {
      div?.removeEventListener('click', this.__eventTreeNodeVisibilityInteractionRefresh, true);
      div?.removeEventListener('contextmenu', this.__eventTreeNodeVisibilityInteractionRefresh, true);
    }
    if (this.__eventTreeNodeVisibilityChangedSelection) {
      this.diagram?.removeDiagramListener('ChangedSelection', this.__eventTreeNodeVisibilityChangedSelection);
    }
    if (this.__eventTreeNodeVisibilityLayoutCompleted) {
      this.diagram?.removeDiagramListener('LayoutCompleted', this.__eventTreeNodeVisibilityLayoutCompleted);
    }
    originalOnDestroy.call(this);
  };
}
