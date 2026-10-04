import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const NORMAL_LINK_STROKE = '#1f2937';
const ACTIVE_LINK_STROKE = '#0f5bd8';
const NORMAL_LINK_WIDTH = 1;
const ACTIVE_LINK_WIDTH = 1.25;
const ACTIVE_SEQUENCE_FILL = '#e8f1ff';
const ACTIVE_SEQUENCE_STROKE = '#0f5bd8';

export function installEventTreeForwardSelectionPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeForwardSelectionPatchInstalled) return;
  prototype.__eventTreeForwardSelectionPatchInstalled = true;

  const originalSelectBranchSource = prototype.selectBranchSource;

  const resetVisuals = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.links.each((link: go.Link) => {
      if (!link.path) return;
      link.path.stroke = NORMAL_LINK_STROKE;
      link.path.strokeWidth = NORMAL_LINK_WIDTH;
    });

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'SEQUENCE') return;
      const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
      if (!shape) return;
      if (!node.isSelected) {
        shape.fill = '#ffffff';
        shape.stroke = '#cbd5e1';
        shape.strokeWidth = 1;
      }
    });
  };

  const applyForwardOnlyHighlight = (component: any, sourceKey: string): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const source = diagram.findNodeForKey(sourceKey);
    if (!source) return;

    resetVisuals(component);

    const visitedNodes = new Set<go.Node>();
    const visitedLinks = new Set<go.Link>();
    const queue: go.Node[] = [source];
    visitedNodes.add(source);

    while (queue.length) {
      const current = queue.shift()!;
      current.findLinksOutOf().each((link: go.Link) => {
        visitedLinks.add(link);
        const target = link.toNode;
        if (!target || visitedNodes.has(target)) return;
        visitedNodes.add(target);
        queue.push(target);
      });
    }

    visitedLinks.forEach((link) => {
      if (!link.path) return;
      link.path.stroke = ACTIVE_LINK_STROKE;
      link.path.strokeWidth = ACTIVE_LINK_WIDTH;
    });

    visitedNodes.forEach((node) => {
      const data = node.data as any;
      if (data?.category !== 'SEQUENCE') return;
      const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
      if (!shape) return;
      shape.fill = ACTIVE_SEQUENCE_FILL;
      shape.stroke = ACTIVE_SEQUENCE_STROKE;
      shape.strokeWidth = 1.5;
    });
  };

  prototype.selectBranchSource = function(key: string): void {
    originalSelectBranchSource.call(this, key);

    // The context-menu patch also applies its own logical-subtree highlight.
    // Run after that work so the final visual state is strictly downstream
    // from the selected point: selected node -> branches -> consequences.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => applyForwardOnlyHighlight(this, key));
    });
  };
}
