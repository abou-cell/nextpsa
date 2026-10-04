import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';
import { EventTreePageComponent } from '../../features/event-tree/event-tree-page.component';

type BranchClipboard = {
  sourceTreeId: string;
  sourceSequenceKey: string;
  frequency?: string;
  consequence?: string;
  resultCode?: string;
};

let branchClipboard: BranchClipboard | null = null;
let activeEventTreePage: any = null;

export function installEventTreeBranchContextMenuPatch(): void {
  const pagePrototype = EventTreePageComponent.prototype as any;
  if (!pagePrototype.__eventTreeBranchContextPageCaptureInstalled) {
    pagePrototype.__eventTreeBranchContextPageCaptureInstalled = true;
    const originalTableMinWidth = pagePrototype.tableMinWidth;
    pagePrototype.tableMinWidth = function(): number {
      activeEventTreePage = this;
      return originalTableMinWidth.call(this);
    };
  }

  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeBranchContextMenuInstalled) return;
  prototype.__eventTreeBranchContextMenuInstalled = true;

  const originalInstallTemplates = prototype.installTemplates;

  const getBranchSequenceKey = (component: any, branchKey: string): string | null => {
    const branch = component.model?.nodes?.find(
      (node: any) => node.key === branchKey && node.category === 'BRANCH'
    );
    return branch?.pathSequenceKey ?? null;
  };

  const refresh = (component: any): void => {
    requestAnimationFrame(() => component.refreshLayout?.());
  };

  const copyBranch = (component: any, branchKey: string): boolean => {
    const tree = component.model;
    const sequenceKey = getBranchSequenceKey(component, branchKey);
    if (!tree || !sequenceKey) return false;
    const sequence = tree.nodes.find((node: any) => node.key === sequenceKey && node.category === 'SEQUENCE');
    if (!sequence) return false;

    branchClipboard = {
      sourceTreeId: tree.id,
      sourceSequenceKey: sequenceKey,
      frequency: sequence.frequency ?? '',
      consequence: sequence.consequence ?? '',
      resultCode: sequence.resultCode ?? ''
    };
    return true;
  };

  const normalizeSequences = (nodes: any[]): any[] => {
    const sequences = nodes.filter((node) => node.category === 'SEQUENCE');
    const children = new Map<string, any[]>();
    sequences.forEach((sequence) => {
      const parent = sequence.parentSequenceKey;
      if (!parent) return;
      const list = children.get(parent) ?? [];
      list.push(sequence);
      children.set(parent, list);
    });
    children.forEach((list) => list.sort((a, b) => {
      const columnDiff = (b.branchColumnIndex ?? 0) - (a.branchColumnIndex ?? 0);
      return columnDiff !== 0 ? columnDiff : (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0);
    }));

    const orderedKeys: string[] = [];
    const visit = (key: string): void => {
      orderedKeys.push(key);
      (children.get(key) ?? []).forEach((child) => visit(child.key));
    };
    sequences
      .filter((sequence) => !sequence.parentSequenceKey)
      .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0))
      .forEach((root) => visit(root.key));

    const displayNo = new Map(orderedKeys.map((key, index) => [key, index + 1]));
    return nodes.map((node) => {
      if (node.category !== 'SEQUENCE') return node;
      const sequenceNo = displayNo.get(node.key) ?? node.sequenceNo ?? 1;
      return { ...node, sequenceNo, label: `Sequence ${sequenceNo}` };
    });
  };

  const cutBranch = (component: any, branchKey: string): void => {
    if (!copyBranch(component, branchKey)) return;
    const page = activeEventTreePage;
    const repository = page?.repository;
    const treeId = component.model?.id;
    const rootSequenceKey = getBranchSequenceKey(component, branchKey);
    if (!repository || !treeId || !rootSequenceKey) return;

    (repository as any).saveHistory?.();
    repository.eventTrees.update((trees: any[]) => trees.map((tree: any) => {
      if (tree.id !== treeId) return tree;

      const sequenceKeys = new Set<string>([rootSequenceKey]);
      let changed = true;
      while (changed) {
        changed = false;
        tree.nodes.forEach((node: any) => {
          if (node.category !== 'SEQUENCE' || !node.parentSequenceKey) return;
          if (sequenceKeys.has(node.parentSequenceKey) && !sequenceKeys.has(node.key)) {
            sequenceKeys.add(node.key);
            changed = true;
          }
        });
      }

      const removedNodeKeys = new Set<string>();
      tree.nodes.forEach((node: any) => {
        if ((node.category === 'SEQUENCE' && sequenceKeys.has(node.key))
          || (node.category === 'BRANCH' && node.pathSequenceKey && sequenceKeys.has(node.pathSequenceKey))) {
          removedNodeKeys.add(node.key);
        }
      });

      const nodes = normalizeSequences(tree.nodes.filter((node: any) => !removedNodeKeys.has(node.key)));
      const links = tree.links.filter((link: any) => !removedNodeKeys.has(link.from) && !removedNodeKeys.has(link.to));
      return { ...tree, nodes, links };
    }));
    (repository as any).updateHistorySignals?.();
    component.selectedBranchKey?.set?.(null);
    component.selectedBranchCount?.set?.(0);
    refresh(component);
  };

  const pasteBranch = (component: any, targetKey: string): void => {
    if (!branchClipboard) return;
    const page = activeEventTreePage;
    const repository = page?.repository;
    const treeId = component.model?.id;
    if (!repository || !treeId) return;

    const beforeTree = repository.eventTrees().find((tree: any) => tree.id === treeId);
    if (!beforeTree) return;
    const beforeSequences = new Set(
      beforeTree.nodes.filter((node: any) => node.category === 'SEQUENCE').map((node: any) => node.key)
    );

    repository.addBranch(treeId, targetKey);

    repository.eventTrees.update((trees: any[]) => trees.map((tree: any) => {
      if (tree.id !== treeId) return tree;
      const created = tree.nodes.find(
        (node: any) => node.category === 'SEQUENCE' && !beforeSequences.has(node.key)
      );
      if (!created) return tree;
      return {
        ...tree,
        nodes: tree.nodes.map((node: any) => node.key === created.key
          ? {
              ...node,
              frequency: branchClipboard?.frequency ?? '',
              consequence: branchClipboard?.consequence ?? '',
              resultCode: branchClipboard?.resultCode ?? ''
            }
          : node)
      };
    }));
    refresh(component);
  };

  const selectWholeBranch = (component: any, branchKey: string): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    const sequenceKey = getBranchSequenceKey(component, branchKey);
    if (!diagram || !sequenceKey) return;

    diagram.clearSelection();
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if ((data?.category === 'BRANCH' && data.pathSequenceKey === sequenceKey)
        || (data?.category === 'SEQUENCE' && data.key === sequenceKey)) {
        node.isSelected = true;
      }
    });
    component.selectBranchSource?.(branchKey);
  };

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;
    const template = diagram.nodeTemplateMap.get('BRANCH') as go.Node | null;
    if (!template) return;

    const $ = go.GraphObject.make;
    const action = (label: string, handler: (key: string) => void, enabled?: () => boolean): go.Panel =>
      $('ContextMenuButton',
        $(go.TextBlock, label, {
          margin: new go.Margin(5, 22, 5, 8),
          font: '10px Arial, sans-serif',
          stroke: '#111827'
        }),
        {
          click: (_event: go.InputEvent, button: go.GraphObject) => {
            const adorned = button.part?.adornedPart as go.Node | null;
            const key = adorned?.data?.key as string | undefined;
            if (!key) return;
            adorned.isSelected = true;
            handler(key);
          }
        },
        enabled ? new go.Binding('isEnabled', '', () => enabled()).ofObject() : {}
      );

    template.contextMenu =
      $('ContextMenu',
        action('Ajouter une branche', (key) => {
          this.selectBranchSource?.(key);
          if ((this.selectedBranchCount?.() ?? 0) < 10) this.addBranch.emit(key);
        }),
        action('Sélectionner la branche', (key) => selectWholeBranch(this, key)),
        $(go.Shape, 'LineH', { stretch: go.Stretch.Horizontal, stroke: '#d1d5db', margin: new go.Margin(3, 4, 3, 4) }),
        action('Copier', (key) => copyBranch(this, key)),
        action('Coller', (key) => pasteBranch(this, key), () => branchClipboard !== null),
        action('Couper', (key) => cutBranch(this, key))
      );
  };
}
