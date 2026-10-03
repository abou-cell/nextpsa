import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const NORMAL_DOT_SIZE = 1.5;
const ACTIVE_DOT_SIZE = 6;
const HOVER_HIT_SIZE = 30;

export function installEventTreeDotBehaviorPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__smallDotPatchInstalled) return;
  prototype.__smallDotPatchInstalled = true;

  const originalInstallTemplates = prototype.installTemplates;
  const originalUpdateDotVisuals = prototype.updateDotVisuals;

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const addHoverHitArea = (template: go.Node): void => {
      template.add(
        go.GraphObject.make(go.Shape, 'Circle', {
          name: 'HIT_AREA',
          width: HOVER_HIT_SIZE,
          height: HOVER_HIT_SIZE,
          fill: 'rgba(0,0,0,0.001)',
          stroke: null
        })
      );
    };

    const configureSelectableDot = (category: 'FE_POINT' | 'BRANCH'): void => {
      const template = diagram.nodeTemplateMap.get(category) as go.Node | null;
      if (!template) return;

      const dot = template.findObject('DOT') as go.Shape | null;
      if (dot) {
        dot.width = NORMAL_DOT_SIZE;
        dot.height = NORMAL_DOT_SIZE;
      }

      addHoverHitArea(template);

      template.mouseEnter = (_event: go.InputEvent, node: go.GraphObject) => {
        this.resizeDot(node, ACTIVE_DOT_SIZE);
      };

      template.mouseLeave = (_event: go.InputEvent, node: go.GraphObject) => {
        const part = node.part as go.Node | null;
        const key = part?.data?.key as string | undefined;
        this.resizeDot(
          node,
          key && key === this.selectedBranchKey() ? ACTIVE_DOT_SIZE : NORMAL_DOT_SIZE
        );
      };
    };

    configureSelectableDot('FE_POINT');
    configureSelectableDot('BRANCH');

    const startTemplate = diagram.nodeTemplateMap.get('START_POINT') as go.Node | null;
    if (startTemplate) {
      startTemplate.selectable = true;
      startTemplate.selectionAdorned = false;
      startTemplate.cursor = 'pointer';

      const startDot = startTemplate.elt(0) as go.Shape | null;
      if (startDot) {
        startDot.name = 'DOT';
        startDot.width = NORMAL_DOT_SIZE;
        startDot.height = NORMAL_DOT_SIZE;
      }

      addHoverHitArea(startTemplate);

      startTemplate.mouseEnter = (_event: go.InputEvent, node: go.GraphObject) => {
        this.resizeDot(node, ACTIVE_DOT_SIZE);
      };

      startTemplate.mouseLeave = (_event: go.InputEvent, node: go.GraphObject) => {
        const part = node.part as go.Node | null;
        this.resizeDot(node, part?.isSelected ? ACTIVE_DOT_SIZE : NORMAL_DOT_SIZE);
      };

      startTemplate.click = (_event: go.InputEvent, node: go.GraphObject) => {
        const part = node.part as go.Node | null;
        if (part) part.isSelected = true;
      };
    }
  };

  prototype.updateDotVisuals = function(): void {
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const selectedKey = this.selectedBranchKey() as string | null;

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as { category?: string; key?: string } | undefined;
      const category = data?.category;
      if (category !== 'FE_POINT' && category !== 'BRANCH' && category !== 'START_POINT') return;

      const dot = node.findObject('DOT') as go.Shape | null;
      if (!dot) return;

      const isActive = category === 'START_POINT'
        ? node.isSelected
        : data?.key === selectedKey;

      dot.width = isActive ? ACTIVE_DOT_SIZE : NORMAL_DOT_SIZE;
      dot.height = isActive ? ACTIVE_DOT_SIZE : NORMAL_DOT_SIZE;
    });
  };

  // Keep a reference so future refactors can still inspect/restore the previous behavior.
  prototype.__originalUpdateDotVisuals = originalUpdateDotVisuals;
}
