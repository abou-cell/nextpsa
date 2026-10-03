import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EditorInternals = EventTreeEditorComponent & {
  diagram?: go.Diagram;
  selectedBranchKey: { (): string | null };
  resizeDot(node: go.GraphObject, size: number): void;
  updateDotVisuals(): void;
  installTemplates(metrics: unknown): void;
};

const prototype = EventTreeEditorComponent.prototype as unknown as {
  resizeDot(node: go.GraphObject, size: number): void;
  updateDotVisuals(): void;
  installTemplates(metrics: unknown): void;
};

const originalResizeDot = prototype.resizeDot;
const originalInstallTemplates = prototype.installTemplates;

prototype.resizeDot = function (this: EditorInternals, node: go.GraphObject, size: number): void {
  const mappedSize = size >= 8 ? 5 : 3.5;
  originalResizeDot.call(this, node, mappedSize);
};

prototype.updateDotVisuals = function (this: EditorInternals): void {
  if (!this.diagram) return;
  const selectedBranchKey = this.selectedBranchKey();

  this.diagram.nodes.each((node) => {
    const data = node.data as { category?: string; key?: string } | undefined;
    const isBranchPoint = data?.category === 'FE_POINT' || data?.category === 'BRANCH';
    const isStartPoint = data?.category === 'START_POINT';
    if (!isBranchPoint && !isStartPoint) return;

    const dot = node.findObject('DOT') as go.Shape | null;
    if (!dot) return;

    const selected = isStartPoint ? node.isSelected : data?.key === selectedBranchKey;
    const size = selected ? 5 : 3.5;
    dot.width = size;
    dot.height = size;
  });
};

prototype.installTemplates = function (this: EditorInternals, metrics: unknown): void {
  originalInstallTemplates.call(this, metrics);
  if (!this.diagram) return;

  const $ = go.GraphObject.make;
  this.diagram.nodeTemplateMap.add('START_POINT',
    $(go.Node, 'Spot',
      {
        selectable: true,
        selectionAdorned: false,
        cursor: 'pointer',
        locationSpot: go.Spot.Center,
        fromSpot: go.Spot.Center,
        toSpot: go.Spot.Center,
        mouseEnter: (_event: go.InputEvent, node: go.GraphObject) => this.resizeDot(node, 8),
        mouseLeave: (_event: go.InputEvent, node: go.GraphObject) => {
          const part = node.part as go.Node | null;
          this.resizeDot(node, part?.isSelected ? 8 : 5);
        },
        click: (_event: go.InputEvent, node: go.GraphObject) => {
          const part = node.part as go.Node | null;
          if (!part) return;
          part.isSelected = true;
          this.updateDotVisuals();
        }
      },
      new go.Binding('location', 'loc', go.Point.parse),
      $(go.Shape, 'Circle', {
        name: 'DOT',
        width: 3.5,
        height: 3.5,
        fill: '#111111',
        stroke: '#111111',
        strokeWidth: 0,
        portId: ''
      })
    )
  );

  ['FE_POINT', 'BRANCH'].forEach((category) => {
    const template = this.diagram!.nodeTemplateMap.getValue(category) as go.Node | null;
    const dot = template?.findObject('DOT') as go.Shape | null;
    if (dot) {
      dot.width = 3.5;
      dot.height = 3.5;
    }
  });
};
