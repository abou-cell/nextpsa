import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

interface HeaderLayoutMetrics {
  blockWidth: number;
}

interface HeaderDragDetail {
  treeId: string;
  fromIndex: number;
  toIndex: number;
}

export function installEventTreeHeaderDragPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__headerDragPatchInstalled) return;
  prototype.__headerDragPatchInstalled = true;

  const originalCreateDiagram = prototype.createDiagram;
  const originalInstallTemplates = prototype.installTemplates;

  prototype.createDiagram = function(): void {
    originalCreateDiagram.call(this);

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.allowMove = true;
    diagram.toolManager.draggingTool.isEnabled = true;

    diagram.addDiagramListener('SelectionMoved', () => {
      const metrics = this.__headerDragMetrics as HeaderLayoutMetrics | undefined;
      const model = this.model;
      const node = diagram.selection.first() as go.Node | null;
      const data = node?.data as {
        key?: string;
        category?: string;
        initiating?: boolean;
      } | undefined;

      if (!metrics || !model || !node || data?.category !== 'HEADER' || data.initiating) return;

      const fromIndex = model.functionEvents.findIndex(
        (event: { id: string }) => `HDR-${event.id}` === data.key
      );
      if (fromIndex < 0) return;

      const maxIndex = Math.max(0, model.functionEvents.length - 1);
      const targetColumn = Math.round(node.location.x / metrics.blockWidth);
      const toIndex = Math.max(0, Math.min(maxIndex, targetColumn - 1));

      node.location = new go.Point((toIndex + 1) * metrics.blockWidth, 0);

      if (toIndex === fromIndex) return;

      const detail: HeaderDragDetail = {
        treeId: model.id,
        fromIndex,
        toIndex
      };
      window.dispatchEvent(new CustomEvent<HeaderDragDetail>('nextpsa-et-reorder-function-event', { detail }));
    });
  };

  prototype.installTemplates = function(metrics: HeaderLayoutMetrics): void {
    originalInstallTemplates.call(this, metrics);
    this.__headerDragMetrics = metrics;

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const headerTemplate = diagram.nodeTemplateMap.get('HEADER') as go.Node | null;
    if (headerTemplate) {
      headerTemplate.selectable = true;
      headerTemplate.selectionAdorned = true;
      headerTemplate.movable = true;
      headerTemplate.cursor = 'pointer';
      headerTemplate.dragComputation = (part: go.Part, newLocation: go.Point): go.Point => {
        const data = part.data as { initiating?: boolean } | undefined;
        if (data?.initiating) return new go.Point(0, 0);

        const eventCount = Math.max(1, this.model?.functionEvents?.length ?? 1);
        const minX = metrics.blockWidth;
        const maxX = eventCount * metrics.blockWidth;
        const x = Math.max(minX, Math.min(maxX, newLocation.x));
        return new go.Point(x, 0);
      };
    }

    ['RESULT_HEADER', 'ANCHOR', 'START_POINT', 'FE_POINT', 'BRANCH', 'SEQUENCE'].forEach((category) => {
      const template = diagram.nodeTemplateMap.get(category) as go.Node | null;
      if (template) template.movable = false;
    });
  };
}
