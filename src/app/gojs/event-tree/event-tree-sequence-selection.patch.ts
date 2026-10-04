import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

export function installEventTreeSequenceSelectionPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__sequenceSelectionPatchInstalled) return;
  prototype.__sequenceSelectionPatchInstalled = true;

  const originalInstallTemplates = prototype.installTemplates;

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const sequenceTemplate = diagram.nodeTemplateMap.get('SEQUENCE') as go.Node | null;
    if (!sequenceTemplate) return;

    sequenceTemplate.selectable = true;
    sequenceTemplate.selectionAdorned = false;
    sequenceTemplate.movable = false;
    sequenceTemplate.cursor = 'pointer';

    const rowShape = sequenceTemplate.elt(0) as go.Shape | null;
    if (rowShape) rowShape.name = 'SEQUENCE_ROW_BG';

    sequenceTemplate.selectionChanged = (part: go.Part): void => {
      const node = part as go.Node;
      const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
      if (!shape) return;

      shape.fill = node.isSelected ? '#e8f1ff' : '#ffffff';
      shape.stroke = node.isSelected ? '#2563eb' : '#cbd5e1';
      shape.strokeWidth = node.isSelected ? 1.5 : 1;
    };
  };
}
