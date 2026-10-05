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

      // A sequence row can be highlighted for two different reasons:
      // 1) the user selected the row itself (GoJS isSelected), or
      // 2) the row belongs to the logical ET branch currently highlighted by the
      //    branch/forward-selection patches. Those patches use the darker
      //    ACTIVE_SEQUENCE_STROKE (#0f5bd8).
      //
      // Do not erase the logical branch highlight when GoJS later emits a
      // deselection callback for a previously selected sequence (notably S1 when
      // the user clicks an upper FE point). That late callback was the reason
      // Sequence 1 became white while downstream rows stayed blue.
      const branchHighlighted = shape.fill === '#e8f1ff' && shape.stroke === '#0f5bd8';
      const active = node.isSelected || branchHighlighted;

      shape.fill = active ? '#e8f1ff' : '#ffffff';
      shape.stroke = node.isSelected
        ? '#2563eb'
        : branchHighlighted
          ? '#0f5bd8'
          : '#cbd5e1';
      shape.strokeWidth = active ? 1.5 : 1;
    };
  };
}
